using System.Diagnostics;
using CronoAI.Api.Sessao;
using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
using CronoAI.Dados.Identidade;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Membros;

/// <summary>
/// Gestão de membros da empresa ativa (scoped): o fluxo "carregar → comparar a versão → aplicar → salvar auditado → mapear a
/// exceção" do ADR 00009, sobre o <c>xmin</c> do vínculo. Carrega SEMPRE antes de escrever (membro de outra empresa e membro
/// inexistente respondem o mesmo 404, nunca 409). Empresa e usuário vêm da sessão (nunca do corpo). O perfil só muda para quem tem
/// <c>membros.gerir</c> (a rota exige), e a última linha de defesa é o gatilho do banco: UPDATE de membro só por administrador e
/// nenhuma empresa sem administrador (409 <c>ultimo-administrador</c>, com a trilha desfeita junto).
/// </summary>
public sealed class ServicoMembros
{
    #region Campos

    private readonly CronoDbContext _banco;
    private readonly ConsultasIdentidade _consultas;
    private readonly ContextoSessao _contexto;
    private readonly TimeProvider _relogio;
    private readonly ILogger<ServicoMembros> _logger;

    #endregion

    #region Construtor

    public ServicoMembros(CronoDbContext banco, ConsultasIdentidade consultas, ContextoSessao contexto, TimeProvider relogio, ILogger<ServicoMembros> logger)
    {
        _banco = banco;
        _consultas = consultas;
        _contexto = contexto;
        _relogio = relogio;
        _logger = logger;
    }

    #endregion

    #region Métodos públicos

    /// <summary>Membros da empresa ativa com o nome de exibição; os removidos só com <paramref name="incluirRemovidos"/>.</summary>
    public async Task<IReadOnlyList<MembroResposta>> ListarAsync(bool incluirRemovidos, CancellationToken cancelamento)
    {
        var usuarioId = _contexto.UsuarioId ?? throw new InvalidOperationException("Listagem de membros sem usuário na sessão.");
        var empresaId = _contexto.EmpresaId ?? throw new InvalidOperationException("Listagem de membros sem empresa ativa na sessão.");
        var membros = await _consultas.ListarMembrosAsync(usuarioId, empresaId, incluirRemovidos, cancelamento);
        return membros.Select(MembroResposta.De).ToList();
    }

    public async Task<ResultadoEscritaMembro> AlterarAsync(Guid usuarioId, AlterarMembroRequisicao requisicao, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(requisicao);

        if (requisicao.Versao is not { } versao)
        {
            return ResultadoEscritaMembro.Invalida("versao", "A versão é obrigatória.");
        }

        // Validação pura primeiro: não toca no banco e não depende de o membro existir (não revela nada).
        if (!Perfis.EhValido(requisicao.Perfil))
        {
            return ResultadoEscritaMembro.Invalida("perfil", "Perfil inválido.");
        }

        var perfil = requisicao.Perfil!;
        if (perfil == Perfis.Encarregado)
        {
            // Sem login de trabalhador até RH e Jurídico liberarem (Q2): o perfil existe no modelo, mas nenhuma rota o atribui.
            return ResultadoEscritaMembro.PerfilIndisponivel();
        }

        var escopo = requisicao.EscopoObras ?? Perfis.EscopoUnico(perfil);
        if (escopo is null)
        {
            return ResultadoEscritaMembro.Invalida("escopoObras", "Informe o escopo de obras (todas ou carteiras) para este perfil.");
        }

        MetadadosEscrita metadados;
        try
        {
            MembroEmpresa.ValidarPar(perfil, escopo);
            metadados = MontarMetadados(requisicao.Motivo);
        }
        catch (ArgumentException erro)
        {
            return ResultadoEscritaMembro.Invalida(erro.ParamName is "perfil" or "escopoObras" ? erro.ParamName : "motivo", erro.Message);
        }

        var membro = await _banco.Membros.SingleOrDefaultAsync(m => m.UsuarioId == usuarioId, cancelamento);
        var recusa = await RecusarAsync(membro, versao, cancelamento);
        if (recusa is not null)
        {
            return recusa;
        }

        // Sem mudança: o EF não emite UPDATE, a versão não anda e nada é auditado.
        if (!membro!.AlterarPerfil(perfil, escopo, metadados.InstanteUtc))
        {
            return ResultadoEscritaMembro.Sucesso(await RespostaAsync(membro, cancelamento));
        }

        var falha = await SalvarAsync(membro, metadados, cancelamento);
        if (falha is not null)
        {
            return falha;
        }

        _logger.MembroAlterado(usuarioId);
        return ResultadoEscritaMembro.Sucesso(await RespostaAsync(membro, cancelamento));
    }

    public async Task<ResultadoEscritaMembro> RemoverAsync(Guid usuarioId, MudancaMembroRequisicao requisicao, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(requisicao);
        if (requisicao.Versao is not { } versao)
        {
            return ResultadoEscritaMembro.Invalida("versao", "A versão é obrigatória.");
        }

        MetadadosEscrita metadados;
        try
        {
            metadados = MontarMetadados(requisicao.Motivo);
        }
        catch (ArgumentException erro)
        {
            return ResultadoEscritaMembro.Invalida("motivo", erro.Message);
        }

        var membro = await _banco.Membros.SingleOrDefaultAsync(m => m.UsuarioId == usuarioId, cancelamento);
        var recusa = await RecusarAsync(membro, versao, cancelamento);
        if (recusa is not null)
        {
            return recusa;
        }

        // Quem é responsável por obra (ou frente) ativa não sai antes de a responsabilidade ser reatribuída: 409 só com ids.
        var obras = await _banco.Obras.AsNoTracking().Where(o => o.ResponsavelId == usuarioId && o.ArquivadaEm == null).Select(o => o.Id).ToListAsync(cancelamento);
        var frentes = await _banco.Frentes.AsNoTracking().Where(f => f.ResponsavelId == usuarioId && f.ArquivadaEm == null).Select(f => f.Id).ToListAsync(cancelamento);
        if (obras.Count > 0 || frentes.Count > 0)
        {
            _logger.EscritaDeMembroRecusada(usuarioId, ResultadoEscritaMembro.MembroResponsavel);
            return ResultadoEscritaMembro.ConflitoDeResponsavel(obras, frentes);
        }

        // Os vínculos de obra do membro saem JUNTO, no mesmo salvamento auditado (uma linha de trilha "remover" por vínculo): a
        // reativação NÃO os restaura, então quem volta não herda o acesso antigo e o administrador reconcede o que for preciso.
        // Os acessos de frente saem antes porque o vínculo da obra é a chave estrangeira deles (Restrict). O administrador enxerga
        // todos os vínculos da empresa pelo RLS.
        var acessosDeFrente = await _banco.AcessosFrente.Where(a => a.UsuarioId == usuarioId).ToListAsync(cancelamento);
        var acessosDeObra = await _banco.AcessosObra.Where(a => a.UsuarioId == usuarioId).ToListAsync(cancelamento);
        _banco.AcessosFrente.RemoveRange(acessosDeFrente);
        _banco.AcessosObra.RemoveRange(acessosDeObra);

        membro!.Remover(metadados.InstanteUtc);
        var falha = await SalvarAsync(membro, metadados, cancelamento);
        if (falha is not null)
        {
            return falha;
        }

        _logger.MembroRemovido(usuarioId);
        return ResultadoEscritaMembro.Sucesso(await RespostaAsync(membro, cancelamento));
    }

    public async Task<ResultadoEscritaMembro> ReativarAsync(Guid usuarioId, MudancaMembroRequisicao requisicao, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(requisicao);
        if (requisicao.Versao is not { } versao)
        {
            return ResultadoEscritaMembro.Invalida("versao", "A versão é obrigatória.");
        }

        MetadadosEscrita metadados;
        try
        {
            metadados = MontarMetadados(requisicao.Motivo);
        }
        catch (ArgumentException erro)
        {
            return ResultadoEscritaMembro.Invalida("motivo", erro.Message);
        }

        var membro = await _banco.Membros.SingleOrDefaultAsync(m => m.UsuarioId == usuarioId, cancelamento);

        // Aqui o membro PRECISA estar removido: a regra de "removido" da troca de perfil e da remoção vale ao contrário.
        var recusa = await RecusarAsync(membro, versao, cancelamento, exigeRemovido: true);
        if (recusa is not null)
        {
            return recusa;
        }

        membro!.Reativar(metadados.InstanteUtc);
        var falha = await SalvarAsync(membro, metadados, cancelamento);
        if (falha is not null)
        {
            return falha;
        }

        _logger.MembroReativado(usuarioId);
        return ResultadoEscritaMembro.Sucesso(await RespostaAsync(membro, cancelamento));
    }

    #endregion

    #region Métodos privados

    // Antes de qualquer UPDATE: ausente (ou de outra empresa) → 404; versão diferente → 409 com o estado carregado; membro já
    // removido → 409 membro-removido (na troca de perfil e na remoção); membro ativo na reativação → 409 membro-nao-removido.
    // Devolve null se a escrita pode seguir.
    private async Task<ResultadoEscritaMembro?> RecusarAsync(MembroEmpresa? membro, long versao, CancellationToken cancelamento, bool exigeRemovido = false)
    {
        if (membro is null)
        {
            return ResultadoEscritaMembro.NaoEncontrado();
        }

        if (versao is < 0 or > uint.MaxValue || membro.Versao != (uint)versao)
        {
            _logger.EscritaDeMembroRecusada(membro.UsuarioId, ResultadoEscritaMembro.ConflitoDeVersao);
            return ResultadoEscritaMembro.Conflito(ResultadoEscritaMembro.ConflitoDeVersao, await RespostaAsync(membro, cancelamento));
        }

        if (exigeRemovido && !membro.EstaRemovido)
        {
            _logger.EscritaDeMembroRecusada(membro.UsuarioId, ResultadoEscritaMembro.MembroNaoRemovido);
            return ResultadoEscritaMembro.Conflito(ResultadoEscritaMembro.MembroNaoRemovido, await RespostaAsync(membro, cancelamento));
        }

        if (!exigeRemovido && membro.EstaRemovido)
        {
            _logger.EscritaDeMembroRecusada(membro.UsuarioId, ResultadoEscritaMembro.MembroRemovido);
            return ResultadoEscritaMembro.Conflito(ResultadoEscritaMembro.MembroRemovido, await RespostaAsync(membro, cancelamento));
        }

        return null;
    }

    // Grava membro + trilha na mesma transação. Devolve null se gravou, ou o resultado do desfecho adverso: o gatilho do último
    // administrador falha no COMMIT (a trilha, já inserida no lote, é desfeita junto); outra gravação depois do meu carregamento
    // muda o xmin e o EF lança DbUpdateConcurrencyException.
    private async Task<ResultadoEscritaMembro?> SalvarAsync(MembroEmpresa membro, MetadadosEscrita metadados, CancellationToken cancelamento)
    {
        try
        {
            await _banco.SalvarAuditadoAsync(metadados, cancelamento);
            return null;
        }
        catch (DbUpdateConcurrencyException erro)
        {
            return await ResolverConcorrenciaAsync(erro, membro.UsuarioId, cancelamento);
        }
        catch (Exception erro) when (MapeadorErrosMembros.Classificar(erro) is DesfechoDeBanco.UltimoAdministrador)
        {
            // O gatilho DIFERIDO falha no COMMIT e o Npgsql entrega a PostgresException direto (sem o embrulho de DbUpdateException):
            // por isso o filtro olha a cadeia inteira, por SqlState e nome da constraint, e nada além disso é capturado.
            _logger.EscritaDeMembroRecusada(membro.UsuarioId, ResultadoEscritaMembro.UltimoAdministrador);
            return ResultadoEscritaMembro.Conflito(ResultadoEscritaMembro.UltimoAdministrador, null);
        }
    }

    // Zero linhas: o membro sumiu (404) ou outra gravação o mudou depois do meu carregamento (409 com o estado do banco).
    private async Task<ResultadoEscritaMembro> ResolverConcorrenciaAsync(DbUpdateConcurrencyException erro, Guid usuarioId, CancellationToken cancelamento)
    {
        // A zero linha pode ser do membro ou de um vínculo que outra pessoa já revogou (remoção do membro): nos dois casos o estado
        // mudou depois do meu carregamento, e o que se devolve é o membro como está no banco agora.
        var entrada = erro.Entries.FirstOrDefault(e => e.Entity is MembroEmpresa);
        MembroEmpresa? atual;
        if (entrada is not null)
        {
            var valores = await entrada.GetDatabaseValuesAsync(cancelamento);
            atual = (MembroEmpresa?)valores?.ToObject();
        }
        else
        {
            atual = await _banco.Membros.AsNoTracking().SingleOrDefaultAsync(m => m.UsuarioId == usuarioId, cancelamento);
        }

        if (atual is null)
        {
            return ResultadoEscritaMembro.NaoEncontrado();
        }

        _logger.EscritaDeMembroRecusada(atual.UsuarioId, ResultadoEscritaMembro.ConflitoDeVersao);
        return ResultadoEscritaMembro.Conflito(ResultadoEscritaMembro.ConflitoDeVersao, await RespostaAsync(atual, cancelamento));
    }

    // O nome de exibição vem do banco só depois de o membro ter sido verificado como DA empresa ativa.
    private async Task<MembroResposta> RespostaAsync(MembroEmpresa membro, CancellationToken cancelamento) =>
        MembroResposta.De(membro, await _consultas.ObterNomeExibicaoAsync(membro.UsuarioId, cancelamento));

    // Origem "ui" (rotas com cookie de sessão), instante do TimeProvider e TraceId da requisição como correlação.
    private MetadadosEscrita MontarMetadados(string? motivo) =>
        new(OrigensAuditoria.Ui, motivo, CorrelacaoDaRequisicao(), _relogio.GetUtcNow().UtcDateTime);

    // TraceId W3C (128 bits, 32 hexadecimais) vira o uuid de correlação com os logs; nulo sem Activity.
    private static Guid? CorrelacaoDaRequisicao() =>
        Activity.Current is { } atividade && Guid.TryParseExact(atividade.TraceId.ToHexString(), "N", out var id) ? id : null;

    #endregion
}
