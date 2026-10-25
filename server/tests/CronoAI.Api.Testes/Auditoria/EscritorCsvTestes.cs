using CronoAI.Api.Auditoria;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Auditoria;

/// <summary>Escritor do CSV da trilha, sem banco: neutralização de fórmula e aspas.</summary>
public sealed class EscritorCsvTestes
{
    #region Campos

    private static readonly DateTime _em = new(2026, 10, 25, 13, 45, 0, DateTimeKind.Utc);

    #endregion

    #region Métodos públicos

    [Theory]
    [InlineData("=1+1", "'=1+1")]
    [InlineData("+1", "'+1")]
    [InlineData("-1", "'-1")]
    [InlineData("@SOMA(A1)", "'@SOMA(A1)")]
    [InlineData("\tx", "'\tx")]
    [InlineData("\rx", "'\rx")]
    public void Csv_neutraliza_celulas_perigosas(string entrada, string esperada)
    {
        Assert.Equal(esperada, EscritorCsvAuditoria.Neutralizar(entrada));

        // Já entre aspas, com o prefixo DENTRO delas (como o Excel o lê).
        Assert.Equal("\"" + esperada + "\"", EscritorCsvAuditoria.Celula(entrada));
    }

    [Fact]
    public void Csv_celula_comum_intacta_e_aspas_duplicadas()
    {
        // Controle negativo do teste acima: o que não começa com caractere perigoso NÃO é tocado.
        Assert.Equal("Obra Aurora", EscritorCsvAuditoria.Neutralizar("Obra Aurora"));
        Assert.Equal("1-2", EscritorCsvAuditoria.Neutralizar("1-2"));
        Assert.Equal("a=b", EscritorCsvAuditoria.Neutralizar("a=b"));
        Assert.Equal(" =1", EscritorCsvAuditoria.Neutralizar(" =1"));
        Assert.Equal("", EscritorCsvAuditoria.Neutralizar(null));
        Assert.Equal("", EscritorCsvAuditoria.Neutralizar(""));

        Assert.Equal("\"a\"\"b\"", EscritorCsvAuditoria.Celula("a\"b"));
        Assert.Equal("\"\"", EscritorCsvAuditoria.Celula(null));
        Assert.Equal("\"Obra Aurora\"", EscritorCsvAuditoria.Celula("Obra Aurora"));
    }

    [Fact]
    public void Csv_linha_tem_o_formato_do_arquivo_de_exemplo()
    {
        var obra = Guid.Parse("0192f0a1-0000-7000-8000-000000000001");
        var usuario = Guid.Parse("0192f0a1-0000-7000-8000-0000000000aa");
        var registro = RegistroAuditoria.Criar(
            Guid.CreateVersion7(),
            obra,
            usuario,
            "obra",
            obra,
            AcoesAuditoria.Alterar,
            "{\"nome\": \"Obra Ficticia Alfa\"}",
            "{\"nome\": \"Obra Ficticia Alfa 2\"}",
            2,
            OrigensAuditoria.Ui,
            "=HYPERLINK(\"http://exemplo.invalid\")",
            null,
            _em);

        var linha = EscritorCsvAuditoria.Linha(registro);

        // Id 0 (ainda sem identity), instante sem fração, motivo neutralizado e aspas do JSON duplicadas; correlação vazia.
        Assert.Equal(
            "\"0\";\"2026-10-25T13:45:00Z\";\"0192f0a1-0000-7000-8000-000000000001\";\"0192f0a1-0000-7000-8000-0000000000aa\";\"obra\";\"0192f0a1-0000-7000-8000-000000000001\";\"alterar\";\"ui\";\"2\";"
            + "\"'=HYPERLINK(\"\"http://exemplo.invalid\"\")\";\"{\"\"nome\"\": \"\"Obra Ficticia Alfa\"\"}\";\"{\"\"nome\"\": \"\"Obra Ficticia Alfa 2\"\"}\";\"\"\r\n",
            linha);
    }

    [Fact]
    public void Csv_cabecalho_fixo_tem_13_colunas_entre_aspas_e_termina_em_crlf()
    {
        Assert.EndsWith("\r\n", EscritorCsvAuditoria.Cabecalho, StringComparison.Ordinal);
        var colunas = CsvTeste.Ler(EscritorCsvAuditoria.Cabecalho).Single();
        Assert.Equal(
            ["id", "em_utc", "obra_id", "usuario_id", "entidade", "entidade_id", "acao", "origem", "versao_depois", "motivo", "antes", "depois", "correlacao_id"],
            colunas);
    }

    #endregion
}
