namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Rota lida do <c>EndpointDataSource</c> do host de teste.</summary>
/// <param name="Metodo">Método HTTP (GET para rotas sem restrição de método, como as de saúde).</param>
/// <param name="Padrao">Padrão da rota (ex.: <c>/api/v1/eu</c>).</param>
/// <param name="Anonima">Se o endpoint tem <c>AllowAnonymous</c>.</param>
public sealed record RotaRegistrada(string Metodo, string Padrao, bool Anonima)
{
    #region Propriedades

    /// <summary>Chave do catálogo: <c>MÉTODO padrão</c>.</summary>
    public string Chave => $"{Metodo} {Padrao}";

    /// <summary>Escrita (exige antiforgery fora a rota de desenvolvimento).</summary>
    public bool EhEscrita => Metodo is "POST" or "PUT" or "PATCH" or "DELETE";

    #endregion
}
