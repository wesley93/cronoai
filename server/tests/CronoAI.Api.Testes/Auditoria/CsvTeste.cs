using System.Text;

namespace CronoAI.Api.Testes.Auditoria;

/// <summary>
/// Leitor mínimo de CSV para os testes (separador <c>;</c>, aspas duplas, <c>""</c> como aspas literais e quebra de linha
/// dentro de campo entre aspas). Independente do escritor do produto: o teste não pode confiar no código que verifica.
/// </summary>
public static class CsvTeste
{
    #region Campos

    /// <summary>Bytes do BOM UTF-8.</summary>
    public static readonly byte[] Bom = [0xEF, 0xBB, 0xBF];

    #endregion

    #region Métodos públicos

    /// <summary>Texto sem o BOM; falha se o BOM não estiver no início.</summary>
    public static string TextoSemBom(byte[] bytes)
    {
        Assert.True(bytes.Length >= 3 && bytes[0] == Bom[0] && bytes[1] == Bom[1] && bytes[2] == Bom[2], "o arquivo deve começar com o BOM UTF-8");
        return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
    }

    /// <summary>Linhas e campos. Exige que TODO campo esteja entre aspas e que cada linha termine em CRLF.</summary>
    public static List<string[]> Ler(string texto)
    {
        var linhas = new List<string[]>();
        var campos = new List<string>();
        var campo = new StringBuilder();
        var i = 0;
        while (i < texto.Length)
        {
            Assert.Equal('"', texto[i]);
            i++;
            campo.Clear();
            while (true)
            {
                Assert.True(i < texto.Length, "campo entre aspas sem fechamento");
                if (texto[i] == '"')
                {
                    if (i + 1 < texto.Length && texto[i + 1] == '"')
                    {
                        campo.Append('"');
                        i += 2;
                        continue;
                    }

                    i++;
                    break;
                }

                campo.Append(texto[i]);
                i++;
            }

            campos.Add(campo.ToString());
            if (i < texto.Length && texto[i] == ';')
            {
                i++;
                continue;
            }

            Assert.True(i + 1 < texto.Length && texto[i] == '\r' && texto[i + 1] == '\n', "a linha deve terminar em CRLF");
            i += 2;
            linhas.Add([.. campos]);
            campos.Clear();
        }

        Assert.Empty(campos);
        return linhas;
    }

    #endregion
}
