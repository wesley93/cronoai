using Microsoft.Extensions.Options;

namespace CronoAI.Api.Desenvolvimento;

/// <summary>
/// Falha fechada na partida (<c>ValidateOnStart</c>): com a flag ligada fora de <c>Development</c>, o host lança
/// <see cref="OptionsValidationException"/> e NÃO sobe. Não basta deixar de mapear a rota.
/// </summary>
public sealed class ValidadorOpcoesUsuarioDesenvolvimento : IValidateOptions<OpcoesUsuarioDesenvolvimento>
{
    #region Campos

    private readonly IHostEnvironment _ambiente;

    #endregion

    #region Construtor

    public ValidadorOpcoesUsuarioDesenvolvimento(IHostEnvironment ambiente)
    {
        _ambiente = ambiente;
    }

    #endregion

    #region Métodos públicos

    public ValidateOptionsResult Validate(string? name, OpcoesUsuarioDesenvolvimento options)
    {
        if (options.Habilitado && !_ambiente.IsDevelopment())
        {
            return ValidateOptionsResult.Fail(
                "O usuário de desenvolvimento só pode ser habilitado em Development (Autenticacao:UsuarioDesenvolvimento:Habilitado).");
        }

        return ValidateOptionsResult.Success;
    }

    #endregion
}
