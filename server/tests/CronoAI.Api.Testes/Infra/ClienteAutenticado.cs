using System.Net.Http.Json;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Passos de um "navegador" de teste: login OIDC completo contra o IdP em memória, login de desenvolvimento e
/// escrita com antiforgery. O <see cref="HttpClient"/> guarda os cookies (correlação, sessão e antiforgery).
/// </summary>
public static class ClienteAutenticado
{
    #region Métodos públicos

    /// <summary>
    /// Login OIDC: <c>GET /entrar</c> → "autorizar" no IdP → retorno ao aplicativo. Devolve a resposta do retorno
    /// (302 para o destino local em caso de sucesso).
    /// </summary>
    public static async Task<HttpResponseMessage> LoginOidcAsync(HttpClient navegador, IdpEmMemoria idp, string? retorno = null, Func<RetornoAutorizacao, RetornoAutorizacao>? adulterar = null)
    {
        var caminho = "/api/v1/autenticacao/entrar" + (retorno is null ? "" : "?retorno=" + Uri.EscapeDataString(retorno));
        using var entrar = await navegador.GetAsync(caminho, TestContext.Current.CancellationToken);
        if (entrar.Headers.Location is null)
        {
            throw new InvalidOperationException($"/entrar não redirecionou ao provedor (status {(int)entrar.StatusCode}).");
        }

        var retornoDoProvedor = idp.Autorizar(entrar.Headers.Location);
        if (adulterar is not null)
        {
            retornoDoProvedor = adulterar(retornoDoProvedor);
        }

        return await VoltarDoProvedorAsync(navegador, retornoDoProvedor);
    }

    /// <summary>Faz o navegador voltar do provedor (GET com query ou POST de formulário).</summary>
    public static async Task<HttpResponseMessage> VoltarDoProvedorAsync(HttpClient navegador, RetornoAutorizacao retorno)
    {
        if (retorno.FormPost)
        {
            using var formulario = new FormUrlEncodedContent(retorno.Campos);
            return await navegador.PostAsync(retorno.RedirectUri, formulario, TestContext.Current.CancellationToken);
        }

        var consulta = string.Join('&', retorno.Campos.Select(c => $"{Uri.EscapeDataString(c.Key)}={Uri.EscapeDataString(c.Value)}"));
        return await navegador.GetAsync(new Uri(retorno.RedirectUri + "?" + consulta), TestContext.Current.CancellationToken);
    }

    /// <summary>Login do usuário de desenvolvimento (<c>dev-a</c> ou <c>dev-b</c>); exige Development + flag.</summary>
    public static async Task<HttpResponseMessage> LoginDesenvolvimentoAsync(HttpClient navegador, string usuario)
    {
        return await navegador.PostAsJsonAsync("/api/v1/autenticacao/desenvolvimento/entrar", new { usuario }, TestContext.Current.CancellationToken);
    }

    /// <summary>Obtém o token de antiforgery da sessão atual (e o cookie dele no cliente).</summary>
    public static async Task<string> ObterTokenAntiforgeryAsync(HttpClient navegador)
    {
        var resposta = await navegador.GetAsync("/api/v1/autenticacao/antiforgery", TestContext.Current.CancellationToken);
        resposta.EnsureSuccessStatusCode();
        var json = await resposta.Content.ReadFromJsonAsync<Dictionary<string, string>>(TestContext.Current.CancellationToken);
        return json!["token"];
    }

    /// <summary>Escrita autenticada com o cabeçalho de antiforgery.</summary>
    public static async Task<HttpResponseMessage> EscreverAsync(HttpClient navegador, HttpMethod metodo, string url, object? corpo = null)
    {
        var token = await ObterTokenAntiforgeryAsync(navegador);
        using var requisicao = new HttpRequestMessage(metodo, url);
        requisicao.Headers.Add("X-XSRF-TOKEN", token);
        if (corpo is not null)
        {
            requisicao.Content = JsonContent.Create(corpo);
        }

        return await navegador.SendAsync(requisicao, TestContext.Current.CancellationToken);
    }

    #endregion
}
