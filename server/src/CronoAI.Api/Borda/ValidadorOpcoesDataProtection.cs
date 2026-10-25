using Microsoft.Extensions.Options;

namespace CronoAI.Api.Borda;

/// <summary>Falha fechada na partida: fora de <c>Development</c>, sem <c>DataProtection:CaminhoAnel</c> a API não sobe.</summary>
public sealed class ValidadorOpcoesDataProtection : IValidateOptions<OpcoesDataProtection>
{
    #region Campos

    private readonly IHostEnvironment _ambiente;

    #endregion

    #region Construtor

    public ValidadorOpcoesDataProtection(IHostEnvironment ambiente)
    {
        _ambiente = ambiente;
    }

    #endregion

    #region Métodos públicos

    public ValidateOptionsResult Validate(string? name, OpcoesDataProtection options)
    {
        if (!_ambiente.IsDevelopment() && string.IsNullOrWhiteSpace(options.CaminhoAnel))
        {
            return ValidateOptionsResult.Fail(
                "DataProtection:CaminhoAnel é obrigatório fora de Development (anel de chaves fora do repositório; ver server/README.md).");
        }

        return ValidateOptionsResult.Success;
    }

    #endregion
}
