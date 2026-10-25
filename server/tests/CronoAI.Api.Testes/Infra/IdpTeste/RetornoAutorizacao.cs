namespace CronoAI.Api.Testes.Infra.IdpTeste;

/// <summary>O que o navegador faz ao voltar do provedor: GET com query ou POST de formulário, para o <c>redirect_uri</c>.</summary>
/// <param name="RedirectUri">Endereço do retorno (callback) do aplicativo.</param>
/// <param name="Campos">Parâmetros devolvidos (<c>code</c> e <c>state</c>).</param>
/// <param name="FormPost">Se verdadeiro, o retorno é um POST <c>application/x-www-form-urlencoded</c>.</param>
public sealed record RetornoAutorizacao(Uri RedirectUri, IReadOnlyDictionary<string, string> Campos, bool FormPost);
