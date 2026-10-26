using System.Net;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Isolamento;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Obras;

/// <summary>Toda rota de escrita de <c>/api/v1/obras</c> do catálogo grava EXATAMENTE uma linha de trilha, com a ação certa.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class AuditoriaPorRotaTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public AuditoriaPorRotaTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Toda_rota_de_escrita_de_obra_gera_uma_auditoria()
    {
        // Um caso por rota de escrita: rota nova no catálogo sem caso aqui reprova o teste.
        var casos = new Dictionary<string, Func<AmbienteApi, Task<(Guid ObraId, int Antes, string AcaoEsperada)>>>(StringComparer.Ordinal)
        {
            ["POST /api/v1/obras"] = async api =>
            {
                var resposta = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", AmbienteApi.CorpoValido());
                return (resposta.Id, 0, AcoesAuditoria.Criar);
            },
            ["PUT /api/v1/obras/{id}"] = async api =>
            {
                var criada = await api.CriarObraAsync();
                await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoDeAtualizacao(criada.Versao, "Alterada " + Guid.NewGuid().ToString("N")[..8]));
                return (criada.Id, 1, AcoesAuditoria.Alterar);
            },
            ["POST /api/v1/obras/{id}/arquivar"] = async api =>
            {
                var criada = await api.CriarObraAsync();
                await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = criada.Versao });
                return (criada.Id, 1, AcoesAuditoria.Arquivar);
            },
            ["POST /api/v1/obras/{id}/restaurar"] = async api =>
            {
                var criada = await api.CriarObraAsync();
                var arquivada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = criada.Versao });
                await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/restaurar", new { versao = arquivada.Versao });
                return (criada.Id, 2, AcoesAuditoria.Restaurar);
            },
        };

        // Os acessos de obra (conceder e revogar) têm o teste próprio de trilha: EscritasNovasTestes.
        var escritasDoCatalogo = CatalogoRotas.Entradas
            .Where(e => e.Padrao.StartsWith("/api/v1/obras", StringComparison.Ordinal) && e.Metodo != "GET" && !e.Padrao.Contains("/acessos", StringComparison.Ordinal))
            .Select(e => e.Chave)
            .ToList();
        Assert.NotEmpty(escritasDoCatalogo);
        Assert.All(escritasDoCatalogo, chave => Assert.True(casos.ContainsKey(chave), $"{chave} é rota de escrita de obra sem caso de trilha"));
        Assert.All(casos.Keys, chave => Assert.Contains(chave, escritasDoCatalogo));

        foreach (var chave in escritasDoCatalogo)
        {
            await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
            var (obraId, antes, acaoEsperada) = await casos[chave](api);

            var trilha = await _dados.LerAuditoriaAsync(api.EmpresaId, obraId);

            Assert.True(trilha.Count == antes + 1, $"{chave}: esperava {antes + 1} linha(s) de trilha, achou {trilha.Count}");
            Assert.Equal(acaoEsperada, trilha[^1].Acao);
            Assert.Equal(api.UsuarioId, trilha[^1].UsuarioId);
            Assert.Equal(OrigensAuditoria.Ui, trilha[^1].Origem);
        }
    }

    #endregion
}
