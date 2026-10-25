using System.Buffers.Text;
using System.Text;
using CronoAI.Api.Auditoria;
using CronoAI.Dados.Auditoria;

namespace CronoAI.Api.Testes.Auditoria;

/// <summary>Cursor opaco da trilha: ida e volta e recusa estrita de qualquer coisa fora do formato.</summary>
public sealed class CodificadorCursorAuditoriaTestes
{
    #region Métodos públicos

    [Fact]
    public void Cursor_faz_ida_e_volta_sem_perder_microssegundos()
    {
        var original = new CursorAuditoria(new DateTime(2026, 10, 25, 13, 45, 0, 123, DateTimeKind.Utc).AddTicks(4560), 42);

        var texto = CodificadorCursorAuditoria.Codificar(original);
        var volta = CodificadorCursorAuditoria.Decodificar(texto);

        Assert.Equal(original, volta);
        Assert.Equal(DateTimeKind.Utc, volta!.Em.Kind);
        Assert.Matches("^[A-Za-z0-9_-]+$", texto);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("!!!")]
    [InlineData("a b")]
    public void Cursor_malformado_e_recusado(string? texto)
    {
        Assert.Null(CodificadorCursorAuditoria.Decodificar(texto));
    }

    [Theory]
    [InlineData("1:2:3")]
    [InlineData("1")]
    [InlineData("-1:5")]
    [InlineData("+1:5")]
    [InlineData("1:0")]
    [InlineData("1:-5")]
    [InlineData("abc:5")]
    [InlineData("5:abc")]
    [InlineData(" 5:6")]
    [InlineData("5: 6")]
    [InlineData("99999999999999999999:5")]
    [InlineData("3155378975999999999999:5")]
    [InlineData("3155378976000000000:5")]
    public void Cursor_com_conteudo_fora_do_formato_e_recusado(string conteudo)
    {
        // Base64url válido, conteúdo inválido.
        Assert.Null(CodificadorCursorAuditoria.Decodificar(Base64Url.EncodeToString(Encoding.UTF8.GetBytes(conteudo))));

        // Controle negativo: o formato certo passa.
        Assert.NotNull(CodificadorCursorAuditoria.Decodificar(Base64Url.EncodeToString(Encoding.UTF8.GetBytes("638000000000000000:7"))));
    }

    [Fact]
    public void Cursor_longo_demais_e_recusado()
    {
        Assert.Null(CodificadorCursorAuditoria.Decodificar(new string('A', 65)));
    }

    #endregion
}
