using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;

namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Lê as rotas do host e compara com o catálogo: é o "detector" que o meta-teste exercita.</summary>
public static class DetectorDeRotas
{
    #region Métodos públicos

    /// <summary>Todas as rotas registradas (um item por método), a partir do <see cref="EndpointDataSource"/>.</summary>
    public static IReadOnlyList<RotaRegistrada> Enumerar(EndpointDataSource fonte)
    {
        ArgumentNullException.ThrowIfNull(fonte);
        var rotas = new List<RotaRegistrada>();
        foreach (var endpoint in fonte.Endpoints.OfType<RouteEndpoint>())
        {
            var padrao = endpoint.RoutePattern.RawText ?? "";
            var anonima = endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null;
            var metodos = endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods;

            // Sem restrição de método (ex.: health checks): trata como GET.
            foreach (var metodo in metodos is { Count: > 0 } ? metodos : ["GET"])
            {
                rotas.Add(new RotaRegistrada(metodo.ToUpperInvariant(), padrao, anonima));
            }
        }

        return rotas;
    }

    /// <summary>Rotas registradas SEM entrada no catálogo (rota nova sem cenário de isolamento).</summary>
    public static IReadOnlyList<string> RotasSemCenario(IEnumerable<RotaRegistrada> registradas, IEnumerable<EntradaCatalogo> catalogo)
    {
        var chaves = catalogo.Select(c => c.Chave).ToHashSet(StringComparer.Ordinal);
        return registradas.Select(r => r.Chave).Where(chave => !chaves.Contains(chave)).Order(StringComparer.Ordinal).ToList();
    }

    /// <summary>Entradas do catálogo cuja rota não existe mais.</summary>
    public static IReadOnlyList<string> EntradasInexistentes(IEnumerable<RotaRegistrada> registradas, IEnumerable<EntradaCatalogo> catalogo)
    {
        var chaves = registradas.Select(r => r.Chave).ToHashSet(StringComparer.Ordinal);
        return catalogo.Select(c => c.Chave).Where(chave => !chaves.Contains(chave)).Order(StringComparer.Ordinal).ToList();
    }

    /// <summary>Substitui parâmetros de rota (<c>{id}</c>) por um valor de exemplo (guid novo; OpenAPI usa "v1").</summary>
    public static string Concretizar(string padrao)
    {
        return padrao
            .Replace("{documentName}", "v1", StringComparison.Ordinal)
            .Replace("{id}", Guid.NewGuid().ToString("D"), StringComparison.Ordinal);
    }

    #endregion
}
