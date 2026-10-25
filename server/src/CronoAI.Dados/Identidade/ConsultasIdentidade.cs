using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Dados.Identidade;

/// <summary>
/// Consultas dos fluxos de identidade (ADR 00006, sequência do plano 00012, seção 3.9). É o ÚNICO arquivo que
/// pode acessar <c>DbSet&lt;Usuario&gt;</c> e usar <c>IgnoreQueryFilters</c> (regra R16; teste de arquitetura),
/// sempre com filtro explícito por usuário. Cada método cria o seu próprio <see cref="CronoDbContext"/> pela
/// fábrica, com o contexto de banco de que precisa: nunca usa o contexto scoped da requisição.
/// </summary>
public sealed class ConsultasIdentidade
{
    #region Campos

    // Array estático: expressão de coleção não cabe em árvore de expressão (consulta LINQ).
    private static readonly string[] _ignorarFiltroEmpresa = [CronoDbContext.FiltroEmpresa];

    private readonly IFabricaCronoDbContext _fabrica;

    #endregion

    #region Construtor

    public ConsultasIdentidade(IFabricaCronoDbContext fabrica)
    {
        _fabrica = fabrica;
    }

    #endregion

    #region Métodos públicos

    /// <summary>
    /// Passo 1: upsert do usuário por (emissor, sujeito), sem contexto de banco (<c>usuario</c> não tem RLS).
    /// Devolve o id EXISTENTE em caso de conflito. Grava o nome vindo do token (nulo se o provedor não mandou: sem manter
    /// valor antigo, minimização). NUNCA toca em <c>desativado_em</c>: o login não reativa conta.
    /// </summary>
    public async Task<Guid> UpsertUsuarioAsync(string emissor, string sujeito, string? nomeExibicao, DateTime agoraUtc, CancellationToken cancelamento = default)
    {
        // A fábrica de domínio valida tamanhos e instante UTC; o id candidato é descartado se houver conflito.
        var candidato = Usuario.Criar(emissor, sujeito, nomeExibicao, agoraUtc);
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.Vazio);

        // Interpolado: cada valor vira parâmetro. Começa com INSERT, portanto não é compostável: materializar direto.
        var ids = await contexto.Database
            .SqlQuery<Guid>($"""
                INSERT INTO cronoai.usuario (id, emissor, sujeito, nome_exibicao, criado_em, ultimo_acesso_em)
                VALUES ({candidato.Id}, {candidato.Emissor}, {candidato.Sujeito}, {candidato.NomeExibicao}, {agoraUtc}, {agoraUtc})
                ON CONFLICT (emissor, sujeito) DO UPDATE
                   SET ultimo_acesso_em = EXCLUDED.ultimo_acesso_em,
                       nome_exibicao = EXCLUDED.nome_exibicao
                RETURNING id AS "Value"
                """)
            .ToListAsync(cancelamento);
        return ids.Single();
    }

    /// <summary>Usuário desativado? O login não reativa conta: quem está desativado não ganha sessão.</summary>
    public async Task<bool> EstaDesativadoAsync(Guid usuarioId, CancellationToken cancelamento = default)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.Vazio);
        return await contexto.Usuarios.AnyAsync(u => u.Id == usuarioId && u.DesativadoEm != null, cancelamento);
    }

    /// <summary>Nome de exibição do usuário (pode ser nulo). Único ponto de leitura de <c>usuario</c> fora do upsert.</summary>
    public async Task<string?> ObterNomeExibicaoAsync(Guid usuarioId, CancellationToken cancelamento = default)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.Vazio);
        return await contexto.Usuarios.Where(u => u.Id == usuarioId).Select(u => u.NomeExibicao).SingleOrDefaultAsync(cancelamento);
    }

    /// <summary>
    /// Passo 2: limpeza oportunista no login. Apaga só as sessões DO PRÓPRIO usuário terminadas antes do corte.
    /// Passa pelo RLS (política de DELETE por usuário). A limpeza em lote fica para o 00023.
    /// </summary>
    public async Task<int> LimparSessoesTerminadasAsync(Guid usuarioId, DateTime corteUtc, CancellationToken cancelamento = default)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioId));
        return await contexto.Sessoes
            .Where(s => s.UsuarioId == usuarioId && (s.ExpiraEm < corteUtc || s.EncerradaEm < corteUtc))
            .ExecuteDeleteAsync(cancelamento);
    }

    /// <summary>Passo 3: grava a sessão (política de INSERT: <c>usuario_id</c> do contexto).</summary>
    public async Task CriarSessaoAsync(Sessao sessao, CancellationToken cancelamento = default)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.DoUsuario(sessao.UsuarioId));
        contexto.Sessoes.Add(sessao);
        await contexto.SaveChangesAsync(cancelamento);
    }

    /// <summary>Passo 4: "minhas empresas" (membro ⋈ empresa), ordenadas por nome.</summary>
    public async Task<IReadOnlyList<EmpresaDoUsuario>> MinhasEmpresasAsync(Guid usuarioId, CancellationToken cancelamento = default)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioId));

        // Sem empresa no contexto: o filtro "Empresa" zeraria a consulta; o vínculo é lido pelo usuário (explícito).
        return await (
            from m in contexto.Membros.IgnoreQueryFilters(_ignorarFiltroEmpresa)
            where m.UsuarioId == usuarioId
            join e in contexto.Empresas on m.EmpresaId equals e.Id
            orderby e.Nome, e.Id
            select new EmpresaDoUsuario(e.Id, e.Nome))
            .ToListAsync(cancelamento);
    }

    /// <summary>
    /// Passo 5: grava a empresa ativa da sessão. A FK composta garante o vínculo (e ignora o RLS). Devolve se
    /// alguma linha foi atualizada; se o usuário NÃO é membro da empresa, a FK é violada (23503) e o método devolve
    /// <c>false</c> (o endpoint responde 404), sem lançar.
    /// </summary>
    public async Task<bool> DefinirEmpresaAtivaAsync(Guid sessaoId, Guid usuarioId, Guid empresaId, CancellationToken cancelamento = default)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioId));
        try
        {
            var linhas = await contexto.Sessoes
                .Where(s => s.Id == sessaoId && s.UsuarioId == usuarioId && s.EncerradaEm == null)
                .ExecuteUpdateAsync(set => set.SetProperty(s => s.EmpresaAtivaId, empresaId), cancelamento);
            return linhas == 1;
        }
        catch (Exception erro) when (EhViolacaoDeChaveEstrangeira(erro))
        {
            return false;
        }
    }

    /// <summary>Encerra a sessão no servidor (logout). Só a do próprio usuário (política de UPDATE).</summary>
    public async Task<bool> EncerrarSessaoAsync(Guid sessaoId, Guid usuarioId, DateTime agoraUtc, CancellationToken cancelamento = default)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioId));
        var linhas = await contexto.Sessoes
            .Where(s => s.Id == sessaoId && s.UsuarioId == usuarioId && s.EncerradaEm == null)
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.EncerradaEm, agoraUtc), cancelamento);
        return linhas == 1;
    }

    /// <summary>
    /// Passo 6: validação por requisição, em UMA consulta: sessão aberta e não vencida, usuário ativo e (se houver
    /// empresa ativa) vínculo vigente. Contexto: o <c>usuario_id</c> do cookie, sem empresa.
    /// </summary>
    public async Task<SessaoValidada?> ValidarSessaoAsync(Guid sessaoId, Guid usuarioId, DateTime agoraUtc, CancellationToken cancelamento = default)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioId));

        return await (
            from s in contexto.Sessoes
            where s.Id == sessaoId && s.UsuarioId == usuarioId && s.EncerradaEm == null && s.ExpiraEm > agoraUtc
            join u in contexto.Usuarios on s.UsuarioId equals u.Id
            where u.DesativadoEm == null
            let vinculoVigente = s.EmpresaAtivaId == null
                || contexto.Membros.IgnoreQueryFilters(_ignorarFiltroEmpresa)
                    .Any(m => m.UsuarioId == s.UsuarioId && m.EmpresaId == s.EmpresaAtivaId)
            where vinculoVigente
            select new SessaoValidada(s.EmpresaAtivaId, u.Emissor))
            .SingleOrDefaultAsync(cancelamento);
    }

    #endregion

    #region Métodos privados

    // O ExecuteUpdate pode entregar a exceção do Npgsql direto ou embrulhada: procura na cadeia.
    private static bool EhViolacaoDeChaveEstrangeira(Exception erro)
    {
        for (var atual = erro; atual is not null; atual = atual.InnerException)
        {
            if (atual is PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation })
            {
                return true;
            }
        }

        return false;
    }

    #endregion
}
