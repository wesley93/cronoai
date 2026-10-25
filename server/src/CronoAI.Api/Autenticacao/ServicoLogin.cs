using CronoAI.Dados.Identidade;
using CronoAI.Dominio;
using Microsoft.Extensions.Options;
using SessaoDominio = CronoAI.Dominio.Sessao;

namespace CronoAI.Api.Autenticacao;

/// <summary>
/// Fluxo único de login (OIDC e usuário de desenvolvimento): passos 1 a 5 do plano 00012, seção 3.9, cada um com o
/// seu próprio <c>DbContext</c> (via <see cref="ConsultasIdentidade"/>). Nunca grava e-mail, token ou código;
/// o log traz só o <c>usuario_id</c>.
/// </summary>
public sealed class ServicoLogin
{
    #region Campos

    private readonly ConsultasIdentidade _consultas;
    private readonly TimeProvider _relogio;
    private readonly IOptions<OpcoesSessao> _opcoesSessao;
    private readonly ILogger<ServicoLogin> _logger;

    #endregion

    #region Construtor

    public ServicoLogin(ConsultasIdentidade consultas, TimeProvider relogio, IOptions<OpcoesSessao> opcoesSessao, ILogger<ServicoLogin> logger)
    {
        _consultas = consultas;
        _relogio = relogio;
        _opcoesSessao = opcoesSessao;
        _logger = logger;
    }

    #endregion

    #region Métodos públicos

    /// <summary>
    /// Entra com (emissor, sujeito) JÁ validados. Devolve <c>null</c> (sem sessão) se o usuário estiver desativado,
    /// se o emissor reservado de desenvolvimento vier fora do fluxo de desenvolvimento ou se os dados forem
    /// inválidos (tamanhos).
    /// </summary>
    public async Task<ResultadoLogin?> EntrarAsync(string emissor, string sujeito, string? nomeExibicao, bool desenvolvimento, CancellationToken cancelamento = default)
    {
        if (emissor == EsquemasAutenticacao.EmissorDesenvolvimento && !desenvolvimento)
        {
            _logger.LoginRecusadoEmissorReservado();
            return null;
        }

        var opcoes = _opcoesSessao.Value;
        var agora = _relogio.GetUtcNow().UtcDateTime;
        var nome = nomeExibicao is { Length: > Usuario.TamanhoMaximoNome } ? nomeExibicao[..Usuario.TamanhoMaximoNome] : nomeExibicao;

        Guid usuarioId;
        try
        {
            // 1. upsert do usuário (sem contexto de banco; nunca reativa conta desativada)
            usuarioId = await _consultas.UpsertUsuarioAsync(emissor, sujeito, nome, agora, cancelamento);
        }
        catch (ArgumentException)
        {
            _logger.LoginRecusadoDadosInvalidos();
            return null;
        }

        if (await _consultas.EstaDesativadoAsync(usuarioId, cancelamento))
        {
            _logger.LoginRecusadoUsuarioDesativado(usuarioId);
            return null;
        }

        // 2. limpeza oportunista: só as sessões terminadas do próprio usuário, além da retenção
        await _consultas.LimparSessoesTerminadasAsync(usuarioId, agora.AddDays(-opcoes.RetencaoDias), cancelamento);

        // 3. sessão nova a cada login (sem fixação de sessão)
        var sessao = SessaoDominio.Criar(usuarioId, agora, agora.AddHours(opcoes.DuracaoMaximaHoras));
        await _consultas.CriarSessaoAsync(sessao, cancelamento);

        // 4 e 5. uma empresa: já fica ativa; várias: ativa vazia até o PUT; nenhuma: sem empresa
        var empresas = await _consultas.MinhasEmpresasAsync(usuarioId, cancelamento);
        if (empresas.Count == 1)
        {
            await _consultas.DefinirEmpresaAtivaAsync(sessao.Id, usuarioId, empresas[0].Id, cancelamento);
        }

        _logger.LoginConcluido(usuarioId);
        return new ResultadoLogin(usuarioId, sessao.Id);
    }

    #endregion
}
