using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace CronoAI.Api.Testes.Infra.IdpTeste;

/// <summary>
/// Emissor OIDC em memória (decisão G1): atende <c>/.well-known/openid-configuration</c>, <c>/jwks</c> e
/// <c>/token</c> como <see cref="HttpMessageHandler"/> (o backchannel do aplicativo aponta para ele; o HTTPS dos
/// metadados continua exigido). A etapa <c>/authorize</c> é o navegador: <see cref="Autorizar"/> a simula, conferindo
/// PKCE S256, cliente e <c>redirect_uri</c>. Chave RSA gerada por execução; só código de teste.
/// </summary>
public sealed class IdpEmMemoria : HttpMessageHandler
{
    #region Campos

    public const string IdClientePadrao = "cronoai-teste";

    private readonly RSA _chave = RSA.Create(2048);
    private readonly RSA _outraChave = RSA.Create(2048);
    private readonly string _kid = Guid.NewGuid().ToString("N");
    private readonly ConcurrentDictionary<string, PedidoAutorizacao> _codigos = new();

    #endregion

    #region Construtor

    public IdpEmMemoria(string emissor = "https://idp.teste")
    {
        Emissor = emissor;
        SegredoCliente = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(24));
    }

    #endregion

    #region Propriedades

    /// <summary>Emissor (<c>iss</c> e autoridade).</summary>
    public string Emissor { get; }

    public string IdCliente { get; } = IdClientePadrao;

    /// <summary>Segredo do cliente confidencial: aleatório por instância, só em memória (nunca fixo no repositório).</summary>
    public string SegredoCliente { get; }

    /// <summary>Como emitir o PRÓXIMO token. Cada <see cref="Autorizar"/> captura a definição vigente e a renova.</summary>
    public DefinicaoToken ProximoToken { get; set; } = new();

    /// <summary>Último código de autorização emitido (para os testes provarem que não aparece em log).</summary>
    public string? UltimoCodigo { get; private set; }

    /// <summary>Último <c>id_token</c> emitido no endpoint de token (idem).</summary>
    public string? UltimoIdToken { get; private set; }

    #endregion

    #region Métodos públicos

    /// <summary>Simula o usuário autenticado e autorizando no provedor: devolve o retorno que o navegador faria.</summary>
    public RetornoAutorizacao Autorizar(Uri urlAutorizacao)
    {
        ArgumentNullException.ThrowIfNull(urlAutorizacao);
        var consulta = QueryHelpers.ParseQuery(urlAutorizacao.Query).ToDictionary(p => p.Key, p => p.Value.ToString());

        Exigir(urlAutorizacao.AbsolutePath == "/authorize", "caminho de autorização inesperado");
        Exigir(consulta.GetValueOrDefault("response_type") == "code", "response_type precisa ser code");
        Exigir(consulta.GetValueOrDefault("client_id") == IdCliente, "client_id desconhecido");
        Exigir(consulta.GetValueOrDefault("code_challenge_method") == "S256", "PKCE S256 obrigatório");
        Exigir(!string.IsNullOrEmpty(consulta.GetValueOrDefault("code_challenge")), "code_challenge ausente");
        Exigir(!string.IsNullOrEmpty(consulta.GetValueOrDefault("state")), "state ausente");
        Exigir(!string.IsNullOrEmpty(consulta.GetValueOrDefault("nonce")), "nonce ausente");
        Exigir(consulta.GetValueOrDefault("scope")?.Split(' ').Contains("openid") == true, "escopo openid ausente");

        var redirectUri = consulta["redirect_uri"];
        var definicao = ProximoToken;
        ProximoToken = new DefinicaoToken();

        var desafio = definicao.AdulterarCodeChallenge ? Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32)) : consulta["code_challenge"];
        var codigo = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
        UltimoCodigo = codigo;
        _codigos[codigo] = new PedidoAutorizacao(IdCliente, redirectUri, consulta["nonce"], desafio, definicao);

        var campos = new Dictionary<string, string> { ["code"] = codigo, ["state"] = consulta["state"] };
        var formPost = consulta.GetValueOrDefault("response_mode") == "form_post";
        return new RetornoAutorizacao(new Uri(redirectUri), campos, formPost, consulta["nonce"]);
    }

    /// <summary>
    /// <c>id_token</c> VÁLIDO (assinado, nonce correto) para ser injetado pelo navegador no retorno de autorização
    /// (canal frontal), como faria um atacante que o obtivesse: o aplicativo deve recusar mesmo assim.
    /// </summary>
    public string EmitirFrontChannel(string nonce, string sujeito)
    {
        var agora = DateTime.UtcNow;
        var descritor = new SecurityTokenDescriptor
        {
            Issuer = Emissor,
            Audience = IdCliente,
            Claims = new Dictionary<string, object> { ["sub"] = sujeito, ["nonce"] = nonce },
            IssuedAt = agora,
            NotBefore = agora,
            Expires = agora.AddMinutes(5),
            SigningCredentials = new SigningCredentials(new RsaSecurityKey(_chave) { KeyId = _kid }, SecurityAlgorithms.RsaSha256),
        };
        return new JsonWebTokenHandler().CreateToken(descritor);
    }

    #endregion

    #region Métodos protegidos

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var caminho = request.RequestUri!.AbsolutePath;
        var resposta = caminho switch
        {
            "/.well-known/openid-configuration" => Json(Metadados()),
            "/jwks" => Json(Jwks()),
            "/token" when request.Method == HttpMethod.Post => await TrocarCodigoAsync(request, cancellationToken),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound),
        };
        resposta.RequestMessage = request;
        return resposta;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _chave.Dispose();
            _outraChave.Dispose();
        }

        base.Dispose(disposing);
    }

    #endregion

    #region Métodos privados

    private static void Exigir(bool condicao, string motivo)
    {
        if (!condicao)
        {
            throw new InvalidOperationException($"IdP de teste recusou o pedido de autorização: {motivo}.");
        }
    }

    private Dictionary<string, object> Metadados() => new Dictionary<string, object>
    {
        ["issuer"] = Emissor,
        ["authorization_endpoint"] = Emissor + "/authorize",
        ["token_endpoint"] = Emissor + "/token",
        ["jwks_uri"] = Emissor + "/jwks",
        ["response_types_supported"] = new[] { "code" },
        ["subject_types_supported"] = new[] { "public" },
        ["id_token_signing_alg_values_supported"] = new[] { "RS256" },
        ["code_challenge_methods_supported"] = new[] { "S256" },
        ["token_endpoint_auth_methods_supported"] = new[] { "client_secret_post", "client_secret_basic" },
    };

    private object Jwks()
    {
        var p = _chave.ExportParameters(false);
        return new { keys = new[] { new { kty = "RSA", use = "sig", kid = _kid, alg = "RS256", n = Base64UrlEncoder.Encode(p.Modulus), e = Base64UrlEncoder.Encode(p.Exponent) } } };
    }

    private async Task<HttpResponseMessage> TrocarCodigoAsync(HttpRequestMessage requisicao, CancellationToken cancelamento)
    {
        var corpo = await requisicao.Content!.ReadAsStringAsync(cancelamento);
        var campos = QueryHelpers.ParseQuery(corpo).ToDictionary(p => p.Key, p => p.Value.ToString());

        // Autenticação do cliente: Basic ou corpo.
        var idCliente = campos.GetValueOrDefault("client_id");
        var segredo = campos.GetValueOrDefault("client_secret");
        if (requisicao.Headers.Authorization is { Scheme: "Basic", Parameter: { } basico })
        {
            var partes = Encoding.UTF8.GetString(Convert.FromBase64String(basico)).Split(':', 2);
            idCliente = Uri.UnescapeDataString(partes[0]);
            segredo = partes.Length > 1 ? Uri.UnescapeDataString(partes[1]) : null;
        }

        if (idCliente != IdCliente || segredo != SegredoCliente)
        {
            return Erro("invalid_client");
        }

        if (campos.GetValueOrDefault("grant_type") != "authorization_code"
            || !_codigos.TryRemove(campos.GetValueOrDefault("code") ?? "", out var pedido)
            || campos.GetValueOrDefault("redirect_uri") != pedido.RedirectUri)
        {
            return Erro("invalid_grant");
        }

        var verificador = campos.GetValueOrDefault("code_verifier") ?? "";
        var calculado = Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verificador)));
        if (calculado != pedido.CodeChallenge)
        {
            return Erro("invalid_grant");
        }

        var idToken = EmitirToken(pedido);
        UltimoIdToken = idToken;
        return Json(new Dictionary<string, object>
        {
            ["id_token"] = idToken,
            ["access_token"] = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16)),
            ["token_type"] = "Bearer",
            ["expires_in"] = 300,
        });
    }

    private string EmitirToken(PedidoAutorizacao pedido)
    {
        var def = pedido.Definicao;
        var agora = DateTime.UtcNow;
        var expira = agora + def.Validade;
        var claims = new Dictionary<string, object> { ["sub"] = def.Sujeito, ["nonce"] = def.Nonce ?? pedido.Nonce };
        if (def.Nome is not null)
        {
            claims["name"] = def.Nome;
        }

        if (def.AlgNone)
        {
            return TokenSemAssinatura(def.Emissor ?? Emissor, def.Audiencia ?? pedido.ClientId, claims, agora, expira);
        }

        var chave = def.AssinarComOutraChave ? _outraChave : _chave;
        var descritor = new SecurityTokenDescriptor
        {
            Issuer = def.Emissor ?? Emissor,
            Audience = def.Audiencia ?? pedido.ClientId,
            Claims = claims,
            IssuedAt = agora,
            NotBefore = agora < expira ? agora : expira.AddMinutes(-1),
            Expires = expira,
            SigningCredentials = new SigningCredentials(new RsaSecurityKey(chave) { KeyId = _kid }, SecurityAlgorithms.RsaSha256),
        };
        return new JsonWebTokenHandler().CreateToken(descritor);
    }

    private static string TokenSemAssinatura(string emissor, string audiencia, Dictionary<string, object> claims, DateTime agora, DateTime expira)
    {
        var cabecalho = JsonSerializer.Serialize(new { alg = "none", typ = "JWT" });
        var carga = new Dictionary<string, object>(claims)
        {
            ["iss"] = emissor,
            ["aud"] = audiencia,
            ["iat"] = new DateTimeOffset(agora).ToUnixTimeSeconds(),
            ["exp"] = new DateTimeOffset(expira).ToUnixTimeSeconds(),
        };
        return Base64UrlEncoder.Encode(Encoding.UTF8.GetBytes(cabecalho)) + "." + Base64UrlEncoder.Encode(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(carga))) + ".";
    }

    private static HttpResponseMessage Json(object conteudo) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(conteudo), Encoding.UTF8, new MediaTypeHeaderValue("application/json")),
    };

    private static HttpResponseMessage Erro(string codigo) => new(HttpStatusCode.BadRequest)
    {
        Content = new StringContent(JsonSerializer.Serialize(new { error = codigo }), Encoding.UTF8, new MediaTypeHeaderValue("application/json")),
    };

    #endregion
}
