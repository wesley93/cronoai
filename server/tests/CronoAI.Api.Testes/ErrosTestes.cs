using System.Net;
using CronoAI.Api.Testes.Infra;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace CronoAI.Api.Testes;

public sealed class ErrosTestes
{
    #region Métodos públicos

    [Fact]
    public async Task Excecao_vira_problem_details_sem_pilha_em_producao()
    {
        await using var fabrica = new ApiFactory(
            ApiFactory.ConexaoSemBanco,
            "Production",
            servicos => servicos.AddSingleton<IStartupFilter, FiltroEndpointQueLanca>());
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/teste/lanca", TestContext.Current.CancellationToken);
        var corpo = await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.InternalServerError, resposta.StatusCode);
        Assert.Equal("application/problem+json", resposta.Content.Headers.ContentType?.MediaType);
        Assert.Contains("traceId", corpo, StringComparison.Ordinal);
        Assert.DoesNotContain("detalhe-secreto", corpo, StringComparison.Ordinal);
        Assert.DoesNotContain("at ", corpo, StringComparison.Ordinal);
        Assert.DoesNotContain("InvalidOperationException", corpo, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Rota_inexistente_404_em_problem_details()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/api/v1/nao-existe", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, resposta.StatusCode);
        Assert.Equal("application/problem+json", resposta.Content.Headers.ContentType?.MediaType);
    }

    #endregion

    #region Tipos auxiliares

    /// <summary>
    /// Endpoint que lança, injetado só no host de teste. Entra depois do pipeline da API
    /// (fica "abaixo" do handler de exceções real, que é o que se quer exercitar).
    /// </summary>
    private sealed class FiltroEndpointQueLanca : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return aplicacao =>
            {
                next(aplicacao);
                aplicacao.Map("/teste/lanca", ramo => ramo.Run(_ => throw new InvalidOperationException("detalhe-secreto")));
            };
        }
    }

    #endregion
}
