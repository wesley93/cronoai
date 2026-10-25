using Microsoft.AspNetCore.Http.Metadata;

namespace CronoAI.Api.Borda;

/// <summary>
/// Metadado de endpoint com o limite do corpo da requisição, lido pelo <see cref="LimiteDeCorpoMiddleware"/>. Implementa a
/// interface padrão <see cref="IRequestSizeLimitMetadata"/>: se o servidor também a honrar, o limite vale nos dois lugares.
/// </summary>
public sealed class LimiteDeCorpoMetadata : IRequestSizeLimitMetadata
{
    #region Construtor

    public LimiteDeCorpoMetadata(long maximoEmBytes)
    {
        MaxRequestBodySize = maximoEmBytes;
    }

    #endregion

    #region Propriedades

    public long? MaxRequestBodySize { get; }

    #endregion
}
