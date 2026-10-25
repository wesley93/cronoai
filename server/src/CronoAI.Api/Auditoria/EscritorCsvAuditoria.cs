using System.Globalization;
using System.Text;
using CronoAI.Dominio;

namespace CronoAI.Api.Auditoria;

/// <summary>
/// Escritor do CSV da trilha, PURO (sem banco nem HTTP). UTF-8 com BOM, separador <c>;</c> (convenção do front e do Excel
/// pt-BR), <c>CRLF</c>, todo campo entre aspas e <c>"</c> duplicado ([RFC 4180](https://www.rfc-editor.org/rfc/rfc4180)).
/// NEUTRALIZA fórmula: toda célula que começa com <c>=</c>, <c>+</c>, <c>-</c>, <c>@</c>, TAB (0x09) ou CR (0x0D) ganha o prefixo
/// <c>'</c> ([OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection)); vale para TODAS as células, sem
/// exceção, porque <c>motivo</c>, <c>antes</c> e <c>depois</c> trazem texto de usuário.
/// </summary>
public static class EscritorCsvAuditoria
{
    #region Campos

    /// <summary>Colunas, na ordem do arquivo.</summary>
    public const string Cabecalho =
        "\"id\";\"em_utc\";\"obra_id\";\"usuario_id\";\"entidade\";\"entidade_id\";\"acao\";\"origem\";\"versao_depois\";\"motivo\";\"antes\";\"depois\";\"correlacao_id\"\r\n";

    /// <summary>Início da linha final de controle (<c>#fim;n</c>).</summary>
    public const string RotuloDoRodape = "#fim";

    private const char Separador = ';';

    #endregion

    #region Métodos públicos

    /// <summary>Escreve o BOM e o cabeçalho.</summary>
    public static async Task EscreverCabecalhoAsync(Stream destino, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(destino);
        await destino.WriteAsync(Encoding.UTF8.GetPreamble(), cancelamento);
        await destino.WriteAsync(Encoding.UTF8.GetBytes(Cabecalho), cancelamento);
    }

    /// <summary>
    /// Escreve uma linha por registro (sem BOM nem cabeçalho), UMA a UMA no destino: nunca monta a página inteira em memória.
    /// </summary>
    public static async Task EscreverRegistrosAsync(Stream destino, IEnumerable<RegistroAuditoria> registros, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(destino);
        ArgumentNullException.ThrowIfNull(registros);
        foreach (var registro in registros)
        {
            await destino.WriteAsync(Encoding.UTF8.GetBytes(Linha(registro)), cancelamento);
        }
    }

    /// <summary>
    /// Linha final de controle <c>#fim;&lt;n&gt;</c>: o usuário distingue um arquivo completo de um cortado (erro no meio da
    /// escrita deixa o arquivo SEM esta linha, e o status 200 já foi enviado). Fora das aspas de propósito: não é registro.
    /// </summary>
    public static async Task EscreverRodapeAsync(Stream destino, long linhas, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(destino);
        await destino.WriteAsync(Encoding.UTF8.GetBytes(Rodape(linhas)), cancelamento);
    }

    /// <summary>Texto da linha final de controle, terminada em <c>CRLF</c>.</summary>
    public static string Rodape(long linhas) => string.Create(CultureInfo.InvariantCulture, $"{RotuloDoRodape}{Separador}{linhas}") + "\r\n";

    /// <summary>Uma linha do arquivo, terminada em <c>CRLF</c>.</summary>
    public static string Linha(RegistroAuditoria registro)
    {
        ArgumentNullException.ThrowIfNull(registro);
        string?[] celulas =
        [
            registro.Id.ToString(CultureInfo.InvariantCulture),
            registro.Em.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'", CultureInfo.InvariantCulture),
            registro.ObraId?.ToString("D"),
            registro.UsuarioId.ToString("D"),
            registro.Entidade,
            registro.EntidadeId.ToString("D"),
            registro.Acao,
            registro.Origem,
            registro.VersaoDepois?.ToString(CultureInfo.InvariantCulture),
            registro.Motivo,
            registro.Antes,
            registro.Depois,
            registro.CorrelacaoId?.ToString("D"),
        ];
        return string.Join(Separador, celulas.Select(Celula)) + "\r\n";
    }

    /// <summary>Texto da célula sem as aspas: nulo vira vazio e o início perigoso ganha o prefixo <c>'</c>.</summary>
    public static string Neutralizar(string? valor)
    {
        if (string.IsNullOrEmpty(valor))
        {
            return "";
        }

        return valor[0] is '=' or '+' or '-' or '@' or '\t' or '\r' ? "'" + valor : valor;
    }

    /// <summary>Célula completa: neutralizada, com <c>"</c> duplicado e entre aspas.</summary>
    public static string Celula(string? valor) => "\"" + Neutralizar(valor).Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";

    #endregion
}
