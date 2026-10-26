using System.Globalization;
using System.Text.RegularExpressions;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// T36 (INFORMATIVO, sem limite que reprove): custo do padrão de política por obra nas tabelas filhas dos próximos ciclos. Tabela
/// sintética de 6.000 linhas com <c>obra_id</c>, numa transação do superusuário nunca confirmada, comparando (1) o padrão não
/// correlacionado <c>obra_id IN (SELECT id FROM obra)</c>, (2) o <c>EXISTS</c> correlacionado e (3) a leitura sem RLS. Os números e
/// o plano vão para o diagnóstico do teste (e, se <c>CRONOAI_SAIDA_DESEMPENHO</c> existir, para esse arquivo). A estimativa do plano
/// ("hashed SubPlan" executado uma vez) é conferida; o tempo NÃO é.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed partial class DesempenhoRlsTestes
{
    #region Campos

    private const string PredicadoNaoCorrelacionado = "obra_id IN (SELECT o.id FROM cronoai.obra o)";

    private const string PredicadoCorrelacionado = "EXISTS (SELECT 1 FROM cronoai.obra o WHERE o.id = zz_sintetica.obra_id)";

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public DesempenhoRlsTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Politica_por_obra_desempenho_referencia()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        var adminNaoCorrelacionado = await MedirAsync(c, c.A, PredicadoNaoCorrelacionado);
        var engenheiroNaoCorrelacionado = await MedirAsync(c, c.B, PredicadoNaoCorrelacionado);
        var adminCorrelacionado = await MedirAsync(c, c.A, PredicadoCorrelacionado);
        var engenheiroCorrelacionado = await MedirAsync(c, c.B, PredicadoCorrelacionado);
        var semRls = await MedirAsync(c, null, null);

        // O que é afirmado (funcional, não de tempo): quantas linhas cada perfil enxerga e que o padrão não correlacionado vira
        // subplano executado uma vez por consulta (hashed SubPlan), e não uma subconsulta por linha.
        Assert.Equal(4500, adminNaoCorrelacionado.Linhas);
        Assert.Equal(1500, engenheiroNaoCorrelacionado.Linhas);
        Assert.Equal(4500, adminCorrelacionado.Linhas);
        Assert.Equal(1500, engenheiroCorrelacionado.Linhas);
        Assert.Equal(6000, semRls.Linhas);
        // O padrão adotado vira "hashed SubPlan" (a subconsulta roda UMA vez e vira tabela hash). Se uma versão do PostgreSQL mudar o
        // plano, este teste avisa antes de a política piorar. (O correlacionado NÃO é afirmado ausente: o plano dele também mostra
        // "hashed SubPlan" aninhado, e o que o distingue é o tempo, que este teste não afirma.)
        Assert.Contains("hashed SubPlan", adminNaoCorrelacionado.Plano, StringComparison.Ordinal);
        Assert.Contains("hashed SubPlan", engenheiroNaoCorrelacionado.Plano, StringComparison.Ordinal);

        var resumo = string.Create(
            CultureInfo.InvariantCulture,
            $"T36 (6.000 linhas, informativo) | não correlacionado: A={adminNaoCorrelacionado.Milissegundos} ms, B={engenheiroNaoCorrelacionado.Milissegundos} ms | correlacionado (EXISTS): A={adminCorrelacionado.Milissegundos} ms, B={engenheiroCorrelacionado.Milissegundos} ms | sem RLS: {semRls.Milissegundos} ms\nPLANO (não correlacionado, A):\n{adminNaoCorrelacionado.Plano}\nPLANO (correlacionado, A):\n{adminCorrelacionado.Plano}");
        TestContext.Current.SendDiagnosticMessage(resumo);
        var saida = Environment.GetEnvironmentVariable("CRONOAI_SAIDA_DESEMPENHO");
        if (!string.IsNullOrEmpty(saida))
        {
            await File.WriteAllTextAsync(saida, resumo, TestContext.Current.CancellationToken);
        }
    }

    #endregion

    #region Métodos privados

    private async Task<(int Linhas, double Milissegundos, string Plano)> MedirAsync(CenarioPermissoes c, Guid? usuario, string? predicado)
    {
        var politica = predicado is null
            ? "SELECT 1"
            : $"ALTER TABLE cronoai.zz_sintetica ENABLE ROW LEVEL SECURITY; CREATE POLICY pol_zz ON cronoai.zz_sintetica AS PERMISSIVE FOR SELECT TO cronoai_app USING ({predicado})";
        var papel = predicado is null
            ? "SELECT 1"
            : $"SET LOCAL ROLE cronoai_app; SELECT set_config('app.usuario_id', '{usuario}', true), set_config('app.empresa_id', '{c.EmpresaX}', true)";
        var script = $"""
            BEGIN;
            CREATE TABLE cronoai.zz_sintetica (id int, obra_id uuid, valor int);
            INSERT INTO cronoai.zz_sintetica SELECT g, (ARRAY['{c.Obra1}', '{c.Obra2}', '{c.Obra3}', '{c.ObraY}'])[1 + g % 4]::uuid, g FROM generate_series(1, 6000) g;
            CREATE INDEX ix_zz_sintetica_obra ON cronoai.zz_sintetica (obra_id);
            ANALYZE cronoai.zz_sintetica;
            GRANT SELECT ON cronoai.zz_sintetica TO cronoai_app;
            {politica};
            {papel};
            SELECT 'LINHAS=' || count(*) FROM cronoai.zz_sintetica;
            EXPLAIN (ANALYZE, COSTS OFF) SELECT count(*) FROM cronoai.zz_sintetica;
            """;

        var (codigo, saida, erro) = await _banco.ExecutarScriptComoSuperusuarioAsync(script);
        Assert.True(codigo == 0, erro);

        var linhas = int.Parse(LinhasRegex().Match(saida).Groups[1].Value, CultureInfo.InvariantCulture);
        var tempo = double.Parse(TempoRegex().Match(saida).Groups[1].Value, CultureInfo.InvariantCulture);
        var plano = string.Join('\n', saida.Split('\n').SkipWhile(l => !l.StartsWith("Aggregate", StringComparison.Ordinal)));
        return (linhas, tempo, plano);
    }

    [GeneratedRegex(@"LINHAS=(\d+)")]
    private static partial Regex LinhasRegex();

    [GeneratedRegex(@"Execution Time: ([0-9.]+) ms")]
    private static partial Regex TempoRegex();

    #endregion
}
