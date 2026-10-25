using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace CronoAI.Api.Autenticacao;

/// <summary>
/// Validador do <c>id_token</c> que força assinatura obrigatória e só algoritmos assimétricos conhecidos, na origem.
/// Em teste, o handler OIDC padrão aceitou um token sem assinatura (<c>alg=none</c>) recebido do endpoint de token
/// (OIDC Core 3.1.3.7, regra 6, deixa a validação por TLS). Defesa em profundidade: a checagem de
/// <c>OnTokenValidated</c> continua valendo.
/// </summary>
public sealed class ValidadorTokenAssinado : JsonWebTokenHandler
{
    #region Métodos públicos

    public override Task<TokenValidationResult> ValidateTokenAsync(string token, TokenValidationParameters validationParameters)
    {
        ArgumentNullException.ThrowIfNull(validationParameters);

        // Clone: os parâmetros das opções são compartilhados entre requisições.
        var parametros = validationParameters.Clone();
        parametros.RequireSignedTokens = true;
        parametros.ValidAlgorithms = [.. AlgoritmosAssinatura.Assimetricos];
        return base.ValidateTokenAsync(token, parametros);
    }

    #endregion
}
