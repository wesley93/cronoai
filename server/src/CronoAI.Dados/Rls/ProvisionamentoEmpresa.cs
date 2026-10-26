using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Dados.Rls;

/// <summary>
/// Cria uma empresa com os primeiros membros FORA da API (Q8, plano 00014 seção 3.8). Hoje o papel da aplicação não tem
/// <c>INSERT</c> em <c>membro_empresa</c> (fecha a escalada de privilégio), então só o DONO da tabela (o migrador) cria o
/// vínculo, pelo mesmo padrão aprovado do <see cref="MigracaoDeDadosRls"/>: numa ÚNICA transação, <c>NO FORCE</c> em
/// <c>empresa</c> e <c>membro_empresa</c> → <c>INSERT</c> → <c>SET CONSTRAINTS ... IMMEDIATE</c> → <c>FORCE</c>. O DDL do
/// PostgreSQL é transacional: qualquer falha (inclusive "empresa sem administrador") desfaz também o <c>NO FORCE</c>.
/// O <c>SET CONSTRAINTS ... IMMEDIATE</c> é necessário: o gatilho do último administrador é diferido e rodaria só no
/// <c>COMMIT</c>, já com o <c>FORCE</c> de volta, e o migrador veria zero linhas. NÃO grava trilha (dado fictício de
/// desenvolvimento): gravar exigiria <c>NO FORCE</c> na <c>auditoria</c> e mexeria na garantia do append-only; é uma exceção
/// declarada da regra R18 (único arquivo permitido). Só a semente de desenvolvimento o chama, e ela recusa fora de
/// <c>Development</c>; a fábrica recebida é a da string do MIGRADOR, lida apenas dentro desse comando. É a primitiva que o
/// comando de produção da Q8 poderá usar quando a Infraestrutura definir a credencial. Idempotente (<c>ON CONFLICT DO NOTHING</c>).
/// </summary>
public sealed class ProvisionamentoEmpresa
{
    #region Campos

    private readonly IFabricaCronoDbContext _fabricaDoMigrador;

    #endregion

    #region Construtor

    public ProvisionamentoEmpresa(IFabricaCronoDbContext fabricaDoMigrador)
    {
        _fabricaDoMigrador = fabricaDoMigrador ?? throw new ArgumentNullException(nameof(fabricaDoMigrador));
    }

    #endregion

    #region Métodos públicos

    /// <summary>
    /// Insere a empresa e os membros (com perfil e escopo). Falha, sem deixar nada para trás, se a empresa ficar sem
    /// administrador ativo (gatilho <c>trg_membro_garante_administrador</c>, forçado a rodar antes do <c>FORCE</c>).
    /// </summary>
    public async Task ProvisionarAsync(Empresa empresa, IReadOnlyCollection<MembroEmpresa> membros, CancellationToken cancelamento = default)
    {
        ArgumentNullException.ThrowIfNull(empresa);
        ArgumentNullException.ThrowIfNull(membros);

        await using var contexto = _fabricaDoMigrador.Criar(ContextoSessaoBanco.Vazio);
        await using var transacao = await contexto.Database.BeginTransactionAsync(cancelamento);

        await contexto.Database.ExecuteSqlAsync($"ALTER TABLE cronoai.empresa NO FORCE ROW LEVEL SECURITY", cancelamento);
        await contexto.Database.ExecuteSqlAsync($"ALTER TABLE cronoai.membro_empresa NO FORCE ROW LEVEL SECURITY", cancelamento);

        await contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.empresa (id, nome, criada_em) VALUES ({empresa.Id}, {empresa.Nome}, {empresa.CriadaEm}) ON CONFLICT (id) DO NOTHING",
            cancelamento);
        foreach (var membro in membros)
        {
            await contexto.Database.ExecuteSqlAsync(
                $"""
                INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id, perfil, escopo_obras, criado_em, atualizado_em)
                VALUES ({membro.EmpresaId}, {membro.UsuarioId}, {membro.Perfil}, {membro.EscopoObras}, {membro.CriadoEm}, {membro.AtualizadoEm})
                ON CONFLICT (empresa_id, usuario_id) DO NOTHING
                """,
                cancelamento);
        }

        // Roda agora, ainda sem FORCE, o gatilho diferido do último administrador.
        await contexto.Database.ExecuteSqlAsync($"SET CONSTRAINTS trg_membro_garante_administrador IMMEDIATE", cancelamento);

        await contexto.Database.ExecuteSqlAsync($"ALTER TABLE cronoai.membro_empresa FORCE ROW LEVEL SECURITY", cancelamento);
        await contexto.Database.ExecuteSqlAsync($"ALTER TABLE cronoai.empresa FORCE ROW LEVEL SECURITY", cancelamento);
        await transacao.CommitAsync(cancelamento);
    }

    #endregion
}
