using System.Diagnostics;
using System.Text.Json;
using CronoAI.Api.Sessao;
using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Obras;

/// <summary>
/// Regra de aplicação das obras (scoped): o fluxo "carregar → comparar a versão → aplicar → salvar auditado → mapear a
/// exceção" do ADR 00009. Carrega SEMPRE antes de escrever: sob RLS o <c>UPDATE</c> de obra de outra empresa afeta zero
/// linhas e, sem o carregamento, viraria 409 em vez de 404 (ADR 00006). O contexto do banco é o da sessão (scoped, criado
/// pela fábrica); empresa e usuário nunca vêm do corpo.
/// </summary>
public sealed class ServicoObras
{
    #region Campos

    private readonly CronoDbContext _banco;
    private readonly ContextoSessao _contexto;
    private readonly TimeProvider _relogio;
    private readonly ILogger<ServicoObras> _logger;

    #endregion

    #region Construtor

    public ServicoObras(CronoDbContext banco, ContextoSessao contexto, TimeProvider relogio, ILogger<ServicoObras> logger)
    {
        _banco = banco;
        _contexto = contexto;
        _relogio = relogio;
        _logger = logger;
    }

    #endregion

    #region Métodos públicos

    /// <summary>Obras da empresa ativa; as arquivadas só entram com <paramref name="incluirArquivadas"/>.</summary>
    public async Task<IReadOnlyList<ObraResposta>> ListarAsync(bool incluirArquivadas, CancellationToken cancelamento)
    {
        var obras = await _banco.Obras.AsNoTracking()
            .Where(o => incluirArquivadas || o.ArquivadaEm == null)
            .OrderBy(o => o.Nome)
            .ThenBy(o => o.Id)
            .ToListAsync(cancelamento);
        return obras.Select(ObraResposta.De).ToList();
    }

    /// <summary>A obra (inclusive arquivada) ou <c>null</c>: inexistente e de outra empresa são indistinguíveis.</summary>
    public async Task<ObraResposta?> ObterAsync(Guid id, CancellationToken cancelamento)
    {
        var obra = await _banco.Obras.AsNoTracking().SingleOrDefaultAsync(o => o.Id == id, cancelamento);
        return obra is null ? null : ObraResposta.De(obra);
    }

    public async Task<ResultadoEscritaObra> CriarAsync(CriarObraRequisicao requisicao, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(requisicao);

        // Validação pura primeiro: não toca no banco.
        DadosObra dados;
        MetadadosEscrita metadados;
        try
        {
            dados = Obra.Validar(ParaDados(requisicao.Nome, requisicao.Uf, requisicao.MunicipioIbge, requisicao.ResponsavelId, requisicao.DataStatus, requisicao.Sinapi, requisicao.OpcoesCronograma));
            metadados = MontarMetadados(requisicao.Motivo);
        }
        catch (ArgumentException erro)
        {
            return ResultadoEscritaObra.Invalida(MapeadorErrosObra.CampoDoDominio(erro.ParamName), erro.Message);
        }

        var ufInvalida = await ConferirUfsAsync(dados, cancelamento);
        if (ufInvalida is not null)
        {
            return ufInvalida;
        }

        var responsavelInvalido = await ConferirResponsavelAsync(dados, cancelamento);
        if (responsavelInvalido is not null)
        {
            return responsavelInvalido;
        }

        var empresaId = _contexto.EmpresaId ?? throw new InvalidOperationException("Escrita de obra sem empresa ativa na sessão.");
        var obra = Obra.Criar(empresaId, dados, metadados.InstanteUtc);
        _banco.Obras.Add(obra);
        try
        {
            await _banco.SalvarAuditadoAsync(metadados, cancelamento);
        }
        catch (DbUpdateException erro) when (MapeadorErrosObra.Classificar(erro) is not null)
        {
            return MapeadorErrosObra.Classificar(erro)!;
        }

        _logger.ObraCriada(obra.Id);
        return ResultadoEscritaObra.Sucesso(ObraResposta.De(obra));
    }

    public async Task<ResultadoEscritaObra> AtualizarAsync(Guid id, AtualizarObraRequisicao requisicao, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(requisicao);

        if (requisicao.Versao is not { } versao)
        {
            return ResultadoEscritaObra.Invalida("versao", "A versão é obrigatória.");
        }

        DadosObra dados;
        MetadadosEscrita metadados;
        try
        {
            dados = Obra.Validar(ParaDados(requisicao.Nome, requisicao.Uf, requisicao.MunicipioIbge, requisicao.ResponsavelId, requisicao.DataStatus, requisicao.Sinapi, requisicao.OpcoesCronograma));
            metadados = MontarMetadados(requisicao.Motivo);
        }
        catch (ArgumentException erro)
        {
            return ResultadoEscritaObra.Invalida(MapeadorErrosObra.CampoDoDominio(erro.ParamName), erro.Message);
        }

        // A lista de UF é global (não revela nada de empresa): conferir antes de carregar mantém o 400 independente da obra existir.
        var ufInvalida = await ConferirUfsAsync(dados, cancelamento);
        if (ufInvalida is not null)
        {
            return ufInvalida;
        }

        var obra = await _banco.Obras.SingleOrDefaultAsync(o => o.Id == id, cancelamento);
        var recusa = Recusar(obra, versao, exigeAtiva: true);
        if (recusa is not null)
        {
            return recusa;
        }

        // O responsável é conferido SÓ quando muda em relação à obra carregada: reenviar o valor atual não pode falhar, senão a obra
        // restaurada com o responsável já removido ficaria sem edição (e o engenheiro nem poderia trocá-lo, 403). Depois do 404 (a
        // obra invisível não chega aqui) e antes do 403 de campo; removido, alheio e inexistente seguem o mesmo 400.
        if (dados.ResponsavelId != obra!.ResponsavelId)
        {
            var responsavelInvalido = await ConferirResponsavelAsync(dados, cancelamento);
            if (responsavelInvalido is not null)
            {
                return responsavelInvalido;
            }
        }

        // Ordem das recusas: 404 → 409 de versão → 409 de arquivada → 403 de campo (acima). Quem edita a obra mas não o cadastro
        // (engenheiro de planejamento) pode reenviar o cadastro IGUAL ao atual; mudar nome, UF, município, responsável ou SINAPI é
        // 403 com os NOMES dos campos. Só quem vê todas as obras (administrador) renomeia: o 409 de nome repetido não revela obra
        // fora do alcance (oráculo de existência).
        if (!PodeEditarCadastro())
        {
            var camposProibidos = obra!.CamposDeCadastroAlterados(dados);
            if (camposProibidos.Count > 0)
            {
                _logger.EscritaRecusadaPorCampoNaoPermitido(obra.Id);
                return ResultadoEscritaObra.CampoNaoPermitido(camposProibidos);
            }
        }

        // Sem mudança: o EF não emite UPDATE, a versão não anda e nada é auditado.
        if (!obra!.Alterar(dados, metadados.InstanteUtc))
        {
            return ResultadoEscritaObra.Sucesso(ObraResposta.De(obra));
        }

        var salvou = await SalvarAsync(obra, versao, metadados, cancelamento);
        if (salvou is not null)
        {
            return salvou;
        }

        _logger.ObraAlterada(obra.Id);
        return ResultadoEscritaObra.Sucesso(ObraResposta.De(obra));
    }

    public Task<ResultadoEscritaObra> ArquivarAsync(Guid id, MudancaArquivamentoRequisicao requisicao, CancellationToken cancelamento) =>
        MudarArquivamentoAsync(id, requisicao, arquivar: true, cancelamento);

    public Task<ResultadoEscritaObra> RestaurarAsync(Guid id, MudancaArquivamentoRequisicao requisicao, CancellationToken cancelamento) =>
        MudarArquivamentoAsync(id, requisicao, arquivar: false, cancelamento);

    #endregion

    #region Métodos privados

    private async Task<ResultadoEscritaObra> MudarArquivamentoAsync(Guid id, MudancaArquivamentoRequisicao requisicao, bool arquivar, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(requisicao);

        if (requisicao.Versao is not { } versao)
        {
            return ResultadoEscritaObra.Invalida("versao", "A versão é obrigatória.");
        }

        MetadadosEscrita metadados;
        try
        {
            metadados = MontarMetadados(requisicao.Motivo);
        }
        catch (ArgumentException erro)
        {
            return ResultadoEscritaObra.Invalida(MapeadorErrosObra.CampoDoDominio(erro.ParamName), erro.Message);
        }

        var obra = await _banco.Obras.SingleOrDefaultAsync(o => o.Id == id, cancelamento);
        var recusa = Recusar(obra, versao, exigeAtiva: false);
        if (recusa is not null)
        {
            return recusa;
        }

        // Arquivar obra arquivada e restaurar obra ativa são conflitos com o estado atual (409), não erro de entrada.
        if (arquivar && obra!.EstaArquivada)
        {
            return ResultadoEscritaObra.Conflito(ResultadoEscritaObra.ObraArquivada, ObraResposta.De(obra));
        }

        if (!arquivar && !obra!.EstaArquivada)
        {
            return ResultadoEscritaObra.Conflito(ResultadoEscritaObra.ObraNaoArquivada, ObraResposta.De(obra));
        }

        if (arquivar)
        {
            obra!.Arquivar(metadados.InstanteUtc);
        }
        else
        {
            obra!.Restaurar(metadados.InstanteUtc);
        }

        var salvou = await SalvarAsync(obra, versao, metadados, cancelamento);
        if (salvou is not null)
        {
            return salvou;
        }

        if (arquivar)
        {
            _logger.ObraArquivada(obra.Id);
        }
        else
        {
            _logger.ObraRestaurada(obra.Id);
        }

        return ResultadoEscritaObra.Sucesso(ObraResposta.De(obra));
    }

    // Antes de qualquer UPDATE: ausente (ou de outra empresa) → 404; versão diferente → 409 com o estado carregado; arquivada
    // e a operação exige obra ativa → 409. Devolve null se a escrita pode seguir.
    private ResultadoEscritaObra? Recusar(Obra? obra, long versao, bool exigeAtiva)
    {
        if (obra is null)
        {
            return ResultadoEscritaObra.NaoEncontrada();
        }

        if (obra.Versao != versao)
        {
            _logger.EscritaRecusadaPorConflito(obra.Id, ResultadoEscritaObra.ConflitoDeVersao);
            return ResultadoEscritaObra.Conflito(ResultadoEscritaObra.ConflitoDeVersao, ObraResposta.De(obra));
        }

        if (exigeAtiva && obra.EstaArquivada)
        {
            _logger.EscritaRecusadaPorConflito(obra.Id, ResultadoEscritaObra.ObraArquivada);
            return ResultadoEscritaObra.Conflito(ResultadoEscritaObra.ObraArquivada, ObraResposta.De(obra));
        }

        return null;
    }

    // Grava obra + trilha na mesma transação. Devolve null se gravou, ou o resultado do desfecho adverso: a versão que o
    // cliente leu virou o ORIGINAL do token de concorrência, então uma corrida (outra gravação depois do meu carregamento)
    // afeta zero linhas e o EF lança DbUpdateConcurrencyException.
    private async Task<ResultadoEscritaObra?> SalvarAsync(Obra obra, long versaoDoCliente, MetadadosEscrita metadados, CancellationToken cancelamento)
    {
        _banco.Entry(obra).Property(o => o.Versao).OriginalValue = versaoDoCliente;
        try
        {
            await _banco.SalvarAuditadoAsync(metadados, cancelamento);
            return null;
        }
        catch (DbUpdateConcurrencyException erro)
        {
            return await ResolverConcorrenciaAsync(erro, cancelamento);
        }
        catch (DbUpdateException erro) when (MapeadorErrosObra.Classificar(erro) is not null)
        {
            var resultado = MapeadorErrosObra.Classificar(erro)!;
            if (resultado.Status == StatusResultadoObra.NaoEncontrada)
            {
                // A FK da trilha reclamou: a obra sumiu depois do meu carregamento. Só o id vai ao log.
                _logger.ObraSumiuNoMeioDaEscrita(obra.Id);
            }

            return resultado;
        }
        catch (DbUpdateException erro) when (MapeadorErrosObra.EhRecusaDePolitica(erro))
        {
            // 42501 sem nome de constraint: com o RLS por obra, a política de INSERT da trilha recusa a obra que deixou de ser
            // visível depois do meu carregamento (vínculo revogado no meio). Confere o estado antes de decidir: obra invisível
            // é obra que sumiu (404, igual ao inexistente); se ela ainda é visível, a recusa é outra coisa e sobe (500 genérico).
            if (await _banco.Obras.AsNoTracking().AnyAsync(o => o.Id == obra.Id, cancelamento))
            {
                throw;
            }

            _logger.ObraSumiuNoMeioDaEscrita(obra.Id);
            return ResultadoEscritaObra.NaoEncontrada();
        }
    }

    // Três causas para zero linhas: versão velha (409 com o estado do banco), obra que sumiu ou ficou invisível por RLS
    // (404, nunca 409) e obra arquivada por outra pessoa depois do meu carregamento (409 com o estado).
    private async Task<ResultadoEscritaObra> ResolverConcorrenciaAsync(DbUpdateConcurrencyException erro, CancellationToken cancelamento)
    {
        var entrada = erro.Entries.FirstOrDefault(e => e.Entity is Obra)
            ?? throw new InvalidOperationException("Conflito de concorrência sem a obra entre as entradas.", erro);
        var valores = await entrada.GetDatabaseValuesAsync(cancelamento);
        if (valores is null)
        {
            _logger.ObraSumiuNoMeioDaEscrita(((Obra)entrada.Entity).Id);
            return ResultadoEscritaObra.NaoEncontrada();
        }

        var atual = (Obra)valores.ToObject();
        var tipo = atual.EstaArquivada ? ResultadoEscritaObra.ObraArquivada : ResultadoEscritaObra.ConflitoDeVersao;
        _logger.EscritaRecusadaPorConflito(atual.Id, tipo);
        return ResultadoEscritaObra.Conflito(tipo, ObraResposta.De(atual));
    }

    // Perfil ausente (defeito) vale como "sem permissão": falha fechada.
    private bool PodeEditarCadastro() =>
        _contexto.Perfil is { } perfil && MatrizPermissoes.Permite(perfil, AcoesPermissao.ObrasEditarCadastro);

    // O responsável precisa ser membro ATIVO da empresa ativa. Removido, de outra empresa e inexistente são indistinguíveis (o
    // filtro de empresa e a política de SELECT de membro_empresa escondem a alheia): mesmo 400, mesma mensagem. A FK do banco
    // continua como rede de segurança (ela aceitaria o removido).
    private async Task<ResultadoEscritaObra?> ConferirResponsavelAsync(DadosObra dados, CancellationToken cancelamento)
    {
        if (dados.ResponsavelId is not { } responsavel)
        {
            return null;
        }

        var ativo = await _banco.Membros.AsNoTracking().AnyAsync(m => m.UsuarioId == responsavel && m.RemovidoEm == null, cancelamento);
        return ativo ? null : ResultadoEscritaObra.Invalida("responsavelId", "O responsável deve ser membro da empresa.");
    }

    // A UF (e a UF do SINAPI) precisa existir na lista nacional (27 linhas): devolve 400 na chave certa, em vez de deixar a FK
    // do banco escolher qual das FKs reclama. A FK continua valendo como rede de segurança.
    private async Task<ResultadoEscritaObra?> ConferirUfsAsync(DadosObra dados, CancellationToken cancelamento)
    {
        var siglas = new[] { dados.Uf, dados.SinapiUf }.Where(sigla => sigla is not null).Select(sigla => sigla!).Distinct().ToList();
        var existentes = await _banco.Ufs.AsNoTracking().Where(u => siglas.Contains(u.Sigla)).Select(u => u.Sigla).ToListAsync(cancelamento);
        if (!existentes.Contains(dados.Uf))
        {
            return ResultadoEscritaObra.Invalida("uf", "UF inexistente.");
        }

        if (dados.SinapiUf is not null && !existentes.Contains(dados.SinapiUf))
        {
            return ResultadoEscritaObra.Invalida("sinapi.uf", "UF do SINAPI inexistente.");
        }

        return null;
    }

    // Origem "ui" (rotas com cookie de sessão), instante do TimeProvider e TraceId da requisição como correlação.
    private MetadadosEscrita MontarMetadados(string? motivo) =>
        new(OrigensAuditoria.Ui, motivo, CorrelacaoDaRequisicao(), _relogio.GetUtcNow().UtcDateTime);

    // TraceId W3C (128 bits, 32 hexadecimais) vira o uuid de correlação com os logs; nulo sem Activity.
    private static Guid? CorrelacaoDaRequisicao() =>
        Activity.Current is { } atividade && Guid.TryParseExact(atividade.TraceId.ToHexString(), "N", out var id) ? id : null;

    private static DadosObra ParaDados(string? nome, string? uf, string? municipioIbge, Guid? responsavelId, DateOnly? dataStatus, SinapiObra? sinapi, JsonElement? opcoes) =>
        new(
            nome!,
            uf!,
            municipioIbge!,
            responsavelId,
            dataStatus,
            sinapi?.Uf,
            sinapi?.Regime,
            sinapi?.DataBase,
            opcoes is { ValueKind: not JsonValueKind.Null and not JsonValueKind.Undefined } valor ? valor.GetRawText() : "{}");

    #endregion
}
