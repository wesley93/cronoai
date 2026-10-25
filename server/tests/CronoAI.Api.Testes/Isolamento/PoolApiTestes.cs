using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using CronoAI.Dados;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Sem vazamento entre empresas no nível da API, com pool de conexões minúsculo e depois de requisição que falha.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class PoolApiTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public PoolApiTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Requisicoes_concorrentes_de_empresas_diferentes_nao_vazam()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(StringComPool(3)) { Idp = idp };
        var a = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 1);
        var b = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 1);
        using var navegadorA = a.Navegador;
        using var navegadorB = b.Navegador;

        // 60 requisições paralelas alternando A e B em /eu e /empresas/atual, com no máximo 3 conexões no pool.
        var chamadas = Enumerable.Range(0, 60).Select(async i =>
        {
            var daA = i % 2 == 0;
            var navegador = daA ? navegadorA : navegadorB;
            var caminho = i % 4 < 2 ? "/api/v1/eu" : "/api/v1/empresas/atual";
            await Task.Yield();
            using var resposta = await navegador.GetAsync(caminho, TestContext.Current.CancellationToken);
            return (DaA: daA, resposta.StatusCode, Corpo: await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        }).ToList();

        var resultados = await Task.WhenAll(chamadas);

        Assert.All(resultados, r =>
        {
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            var minha = r.DaA ? a.Empresas[0] : b.Empresas[0];
            var outra = r.DaA ? b.Empresas[0] : a.Empresas[0];
            var outroUsuario = r.DaA ? b.UsuarioId : a.UsuarioId;
            Assert.Contains(minha.ToString("D"), r.Corpo, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(outra.ToString("D"), r.Corpo, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(outroUsuario.ToString("D"), r.Corpo, StringComparison.OrdinalIgnoreCase);
        });
    }

    [Fact]
    public async Task Requisicao_que_falha_apos_abrir_conexao_nao_contamina_a_seguinte()
    {
        var observacoes = new List<(int Pid, string Empresa)>();
        using var idp = new IdpEmMemoria();

        // Host SEPARADO (rotas de teste fora do catálogo), pool de 1 conexão: a mesma conexão física serve as duas requisições.
        await using var fabrica = new ApiFactory(StringComPool(1), "Production", servicos =>
            servicos.AddSingleton<IStartupFilter>(new FiltroRotasDeTeste(observacoes)))
        {
            Idp = idp,
        };
        var a = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 1);
        var b = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 1);
        using var navegadorA = a.Navegador;
        using var navegadorB = b.Navegador;

        // A abre a conexão com o contexto dela e a requisição lança (500).
        using var falha = await navegadorA.GetAsync("/teste/abre-e-falha", TestContext.Current.CancellationToken);
        // B, logo depois: na mesma conexão física, só vê a empresa B.
        using var seguinte = await navegadorB.GetAsync("/teste/le", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.InternalServerError, falha.StatusCode);
        Assert.Equal(HttpStatusCode.OK, seguinte.StatusCode);
        Assert.Equal(2, observacoes.Count);
        Assert.Equal(a.Empresas[0].ToString("D"), observacoes[0].Empresa);
        Assert.Equal(b.Empresas[0].ToString("D"), observacoes[1].Empresa);
        Assert.Equal(observacoes[0].Pid, observacoes[1].Pid);
        var corpo = await seguinte.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal(b.Empresas[0].ToString("D"), corpo.GetProperty("empresa").GetString());
    }

    #endregion

    #region Métodos privados

    private string StringComPool(int tamanho) =>
        new NpgsqlConnectionStringBuilder(_banco.StringConexaoApp) { MaxPoolSize = tamanho, ApplicationName = "pool-api-" + Guid.NewGuid().ToString("N")[..8] }.ConnectionString;

    #endregion

    #region Tipos auxiliares

    /// <summary>Rotas de teste: uma abre a conexão (contexto da sessão) e lança; a outra devolve o que a conexão enxerga.</summary>
    private sealed class FiltroRotasDeTeste : IStartupFilter
    {
        private readonly List<(int Pid, string Empresa)> _observacoes;

        public FiltroRotasDeTeste(List<(int Pid, string Empresa)> observacoes)
        {
            _observacoes = observacoes;
        }

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return aplicacao =>
            {
                next(aplicacao);
                aplicacao.Map("/teste/abre-e-falha", ramo => ramo.Run(async contexto =>
                {
                    await Observar(contexto);
                    throw new InvalidOperationException("falha proposital depois de abrir a conexão");
                }));
                aplicacao.Map("/teste/le", ramo => ramo.Run(async contexto =>
                {
                    var (_, empresa) = await Observar(contexto);
                    await contexto.Response.WriteAsJsonAsync(new { empresa });
                }));
            };
        }

        private async Task<(int Pid, string Empresa)> Observar(HttpContext contexto)
        {
            // O CronoDbContext scoped já nasce com o contexto da sessão validada (usuário e empresa do cookie).
            var banco = contexto.RequestServices.GetRequiredService<CronoDbContext>();
            var pid = (await banco.Database.SqlQuery<int>($"SELECT pg_backend_pid() AS \"Value\"").ToListAsync()).Single();
            var empresa = (await banco.Database.SqlQuery<string>($"SELECT coalesce(current_setting('app.empresa_id', true), '') AS \"Value\"").ToListAsync()).Single();
            lock (_observacoes)
            {
                _observacoes.Add((pid, empresa));
            }

            return (pid, empresa);
        }
    }

    #endregion
}
