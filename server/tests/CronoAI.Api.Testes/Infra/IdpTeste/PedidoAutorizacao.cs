namespace CronoAI.Api.Testes.Infra.IdpTeste;

/// <summary>Pedido de autorização guardado pelo IdP até a troca do código (<c>/token</c>).</summary>
/// <param name="ClientId">Cliente que pediu.</param>
/// <param name="RedirectUri">Retorno registrado no pedido.</param>
/// <param name="Nonce">Nonce enviado pelo cliente.</param>
/// <param name="CodeChallenge">Desafio PKCE (S256) guardado.</param>
/// <param name="Definicao">Como emitir o token deste código.</param>
public sealed record PedidoAutorizacao(string ClientId, string RedirectUri, string Nonce, string CodeChallenge, DefinicaoToken Definicao);
