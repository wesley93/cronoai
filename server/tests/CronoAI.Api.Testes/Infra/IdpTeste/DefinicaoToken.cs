namespace CronoAI.Api.Testes.Infra.IdpTeste;

/// <summary>
/// Como o IdP em memória monta o PRÓXIMO <c>id_token</c>. Os valores padrão formam um token válido; os testes
/// negativos alteram um campo por vez ("chaves de mau comportamento").
/// </summary>
public sealed class DefinicaoToken
{
    #region Propriedades

    public string Sujeito { get; set; } = "sub-" + Guid.NewGuid().ToString("N");

    public string? Nome { get; set; } = "Pessoa Ficticia";

    /// <summary>Emissor do token; <c>null</c> = o emissor correto do IdP.</summary>
    public string? Emissor { get; set; }

    /// <summary>Audiência do token; <c>null</c> = o id do cliente.</summary>
    public string? Audiencia { get; set; }

    /// <summary>Expiração relativa a agora; padrão: 5 minutos.</summary>
    public TimeSpan Validade { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>Nonce do token; <c>null</c> = o nonce enviado no pedido de autorização.</summary>
    public string? Nonce { get; set; }

    /// <summary>Assina com uma chave que NÃO está no JWKS publicado.</summary>
    public bool AssinarComOutraChave { get; set; }

    /// <summary>Emite um token com <c>alg=none</c> (sem assinatura).</summary>
    public bool AlgNone { get; set; }

    /// <summary>Guarda um <c>code_challenge</c> diferente do enviado: o PKCE falha no endpoint de token.</summary>
    public bool AdulterarCodeChallenge { get; set; }

    #endregion
}
