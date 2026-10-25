using System.Buffers.Text;
using System.Globalization;
using System.Text;
using CronoAI.Dados.Auditoria;

namespace CronoAI.Api.Auditoria;

/// <summary>
/// Cursor OPACO da trilha: base64url de <c>ticks:id</c>. O cliente o devolve sem interpretar. A decodificação é estrita:
/// qualquer coisa fora do formato (base64 inválido, partes a mais ou a menos, sinal, espaço, valor fora da faixa) é recusada
/// e vira 400, nunca uma consulta com valor inesperado.
/// </summary>
public static class CodificadorCursorAuditoria
{
    #region Campos

    private const int TamanhoMaximoDoTexto = 64;

    private const long MaximoDeTicks = 3155378975999999999L;

    #endregion

    #region Métodos públicos

    public static string Codificar(CursorAuditoria cursor)
    {
        ArgumentNullException.ThrowIfNull(cursor);
        var texto = string.Create(CultureInfo.InvariantCulture, $"{cursor.Em.Ticks}:{cursor.Id}");
        return Base64Url.EncodeToString(Encoding.UTF8.GetBytes(texto));
    }

    /// <summary>Devolve <c>null</c> se o texto não for um cursor que este codificador gerou.</summary>
    public static CursorAuditoria? Decodificar(string? texto)
    {
        if (string.IsNullOrEmpty(texto) || texto.Length > TamanhoMaximoDoTexto)
        {
            return null;
        }

        byte[] bytes;
        try
        {
            bytes = Base64Url.DecodeFromChars(texto);
        }
        catch (FormatException)
        {
            return null;
        }

        var partes = Encoding.UTF8.GetString(bytes).Split(':');
        if (partes.Length != 2 || !SomenteAlgarismos(partes[0]) || !SomenteAlgarismos(partes[1]))
        {
            return null;
        }

        if (!long.TryParse(partes[0], NumberStyles.None, CultureInfo.InvariantCulture, out var ticks)
            || !long.TryParse(partes[1], NumberStyles.None, CultureInfo.InvariantCulture, out var id)
            || ticks > MaximoDeTicks
            || id <= 0)
        {
            return null;
        }

        return new CursorAuditoria(new DateTime(ticks, DateTimeKind.Utc), id);
    }

    #endregion

    #region Métodos privados

    // Só '0' a '9' (nunca sinal, espaço nem algarismos de outros alfabetos).
    private static bool SomenteAlgarismos(string texto) => texto.Length > 0 && texto.All(c => c is >= '0' and <= '9');

    #endregion
}
