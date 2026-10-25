using System.Globalization;
using System.Text;
using CronoAI.Api.Sessao;
using CronoAI.Dados.Identidade;
using CronoAI.Dominio;
using Microsoft.Extensions.Options;
using Npgsql;
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
    public async Task<ResultadoLogin?> EntrarAsync(string emissor, string sujeito, string? nomeExibicao, bool desenvolvimento, SessaoAnterior? anterior = null, CancellationToken cancelamento = default)
    {
        if (emissor == EsquemasAutenticacao.EmissorDesenvolvimento && !desenvolvimento)
        {
            _logger.LoginRecusadoEmissorReservado();
            return null;
        }

        var opcoes = _opcoesSessao.Value;
        var agora = _relogio.GetUtcNow().UtcDateTime;
        var nome = NomeSeguro(nomeExibicao);

        Guid usuarioId;
        try
        {
            // 1. upsert do usuário (sem contexto de banco; nunca reativa conta desativada)
            usuarioId = await UpsertAsync(emissor, sujeito, nome, agora, cancelamento);
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

        // Novo login no mesmo navegador encerra a sessão anterior (se o cookie dele ainda era válido).
        if (anterior is not null)
        {
            await _consultas.EncerrarSessaoAsync(anterior.SessaoId, anterior.UsuarioId, agora, cancelamento);
        }

        _logger.LoginConcluido(usuarioId);
        return new ResultadoLogin(usuarioId, sessao.Id);
    }

    /// <summary>
    /// Nome de exibição do provedor, sem caracteres de controle (inclui U+0000, que o PostgreSQL não grava), sem
    /// controles bidirecionais (U+061C, U+200E, U+200F, U+202A a U+202E e U+2066 a U+2069: invertem a ordem de exibição e
    /// permitem forjar nomes) e sem surrogates órfãos (UTF-16 inválido, que não vira UTF-8). Cortado por elemento de
    /// texto (nunca parte um par substituto nem um grafema) em até o limite do domínio. Vazio vira nulo.
    /// </summary>
    public static string? NomeSeguro(string? nome)
    {
        if (string.IsNullOrWhiteSpace(nome))
        {
            return null;
        }

        var limpo = new StringBuilder(nome.Length);
        for (var i = 0; i < nome.Length; i++)
        {
            var caractere = nome[i];
            if (char.IsControl(caractere) || EhControleBidirecional(caractere))
            {
                continue;
            }

            if (char.IsHighSurrogate(caractere) && i + 1 < nome.Length && char.IsLowSurrogate(nome[i + 1]))
            {
                limpo.Append(caractere).Append(nome[i + 1]); // par válido (ex.: emoji)
                i++;
                continue;
            }

            if (char.IsSurrogate(caractere))
            {
                continue; // surrogate órfão
            }

            limpo.Append(caractere);
        }

        var texto = limpo.ToString().Trim();
        var resultado = new StringBuilder(texto.Length);
        var elementos = StringInfo.GetTextElementEnumerator(texto);
        while (elementos.MoveNext())
        {
            var elemento = (string)elementos.Current;
            if (resultado.Length + elemento.Length > Usuario.TamanhoMaximoNome)
            {
                break;
            }

            resultado.Append(elemento);
        }

        return resultado.Length == 0 ? null : resultado.ToString();
    }

    #endregion

    #region Métodos privados

    // Se mesmo o nome saneado for REJEITADO como valor (codificação ou limite do banco), grava nome nulo em vez de
    // recusar o login. Qualquer outro erro (deadlock, timeout, conexão, outra constraint) é propagado: tentar de novo com
    // nome nulo apagaria o nome já gravado por um motivo que não tem a ver com ele.
    private async Task<Guid> UpsertAsync(string emissor, string sujeito, string? nome, DateTime agora, CancellationToken cancelamento)
    {
        try
        {
            return await _consultas.UpsertUsuarioAsync(emissor, sujeito, nome, agora, cancelamento);
        }
        catch (Exception erro) when (nome is not null && NomeRejeitado(erro))
        {
            _logger.NomeDeExibicaoDescartado();
            return await _consultas.UpsertUsuarioAsync(emissor, sujeito, null, agora, cancelamento);
        }
    }

    /// <summary>
    /// Erro que é rejeição do NOME: falha de codificação, <c>22021</c> (character_not_in_repertoire) ou <c>23514</c>
    /// só da constraint <c>ck_usuario_nome_tamanho</c>. Procura na cadeia de exceções internas.
    /// </summary>
    private static bool NomeRejeitado(Exception erro)
    {
        for (var atual = erro; atual is not null; atual = atual.InnerException)
        {
            if (atual is EncoderFallbackException)
            {
                return true;
            }

            if (atual is PostgresException { SqlState: PostgresErrorCodes.CharacterNotInRepertoire })
            {
                return true;
            }

            if (atual is PostgresException { SqlState: PostgresErrorCodes.CheckViolation, ConstraintName: "ck_usuario_nome_tamanho" })
            {
                return true;
            }
        }

        return false;
    }

    private static bool EhControleBidirecional(char c) =>
        c is '\u061C' or '\u200E' or '\u200F' || (c >= '\u202A' && c <= '\u202E') || (c >= '\u2066' && c <= '\u2069');

    #endregion
}
