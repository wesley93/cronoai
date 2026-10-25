using Microsoft.IdentityModel.Tokens;

namespace CronoAI.Api.Autenticacao;

/// <summary>Algoritmos de assinatura aceitos no <c>id_token</c>: só assimétricos conhecidos (nunca <c>none</c> nem HMAC).</summary>
public static class AlgoritmosAssinatura
{
    #region Campos

    public static readonly IReadOnlyList<string> Assimetricos =
    [
        SecurityAlgorithms.RsaSha256, SecurityAlgorithms.RsaSha384, SecurityAlgorithms.RsaSha512,
        SecurityAlgorithms.RsaSsaPssSha256, SecurityAlgorithms.RsaSsaPssSha384, SecurityAlgorithms.RsaSsaPssSha512,
        SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.EcdsaSha384, SecurityAlgorithms.EcdsaSha512,
    ];

    #endregion
}
