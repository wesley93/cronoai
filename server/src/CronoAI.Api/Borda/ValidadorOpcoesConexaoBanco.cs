using Microsoft.Extensions.Options;
using Npgsql;

namespace CronoAI.Api.Borda;

/// <summary>
/// Guarda de partida do RLS: <c>No Reset On Close=true</c> desligaria o <c>DISCARD ALL</c> do pool (a segunda rede
/// contra vazamento de variável de sessão entre conexões). A sobrescrita do interceptor continua valendo, mas a
/// API recusa subir com a rede removida em silêncio. A mensagem nunca traz a string de conexão.
/// </summary>
public sealed class ValidadorOpcoesConexaoBanco : IValidateOptions<OpcoesConexaoBanco>
{
    #region Métodos públicos

    public ValidateOptionsResult Validate(string? name, OpcoesConexaoBanco options)
    {
        // Sem string: a API sobe e /health/ready acusa (comportamento do 00011).
        if (string.IsNullOrWhiteSpace(options.StringConexao))
        {
            return ValidateOptionsResult.Success;
        }

        if (new NpgsqlConnectionStringBuilder(options.StringConexao).NoResetOnClose)
        {
            return ValidateOptionsResult.Fail("ConnectionStrings:Cronoai com 'No Reset On Close=true' não é permitido (RLS e pool; ADR 00006).");
        }

        return ValidateOptionsResult.Success;
    }

    #endregion
}
