using System.Globalization;
using System.Text;
using System.Text.Json;

namespace CronoAI.Dominio;

/// <summary>
/// Regras do JSON opaco <c>opcoes_cronograma</c>: tem de ser um OBJETO, com profundidade e tamanho limitados, e a
/// comparação entre duas versões é semântica (o <c>jsonb</c> reordena chaves e normaliza espaços, então comparar texto
/// geraria um <c>UPDATE</c> à toa a cada <c>PUT</c> sem mudança).
/// </summary>
internal static class JsonOpcoes
{
    #region Campos

    public const int ProfundidadeMaxima = 16;

    public const int TamanhoMaximoBytes = 16384;

    private const int LimiteDoTextoBrutoEmBytes = 65536;

    private const int LimiteDoNumeroEmCaracteres = 32;

    #endregion

    #region Métodos públicos

    /// <summary>Valida o texto (objeto, até 16 níveis, até 16 KB no texto normalizado do jsonb) e devolve o mesmo texto.</summary>
    public static string Validar(string? json, string parametro)
    {
        if (json is null)
        {
            throw new ArgumentException("As opções do cronograma devem ser um objeto JSON.", parametro);
        }

        // Só impede parsear texto enorme (o corpo da API já é limitado a 64 KB); o teto de verdade é o do texto NORMALIZADO, abaixo.
        if (Encoding.UTF8.GetByteCount(json) > LimiteDoTextoBrutoEmBytes)
        {
            throw new ArgumentException($"As opções do cronograma excedem {TamanhoMaximoBytes} bytes.", parametro);
        }

        try
        {
            using var documento = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = ProfundidadeMaxima });
            if (documento.RootElement.ValueKind != JsonValueKind.Object)
            {
                throw new ArgumentException("As opções do cronograma devem ser um objeto JSON.", parametro);
            }

            // O jsonb do PostgreSQL recusa U+0000 em texto (erro 22P05, que viraria 500): recusa-se antes, com 400.
            if (TemCaractereNulo(documento.RootElement))
            {
                throw new ArgumentException("As opções do cronograma não podem ter o caractere nulo.", parametro);
            }

            // O jsonb escreve o número POR EXTENSO: {"a":1e131071} (14 bytes) vira ~131 KB no texto do banco, e ~1.000 chaves assim
            // fazem o CHECK de tamanho montar ~131 MB num backend compartilhado (DoS). Recusa-se antes de gravar: nada de notação
            // exponencial nem número com mais de 32 caracteres. Decimal normal e longo, dentro do teto, passa.
            if (TemNumeroQueExplodeNoJsonb(documento.RootElement))
            {
                throw new ArgumentException("As opções do cronograma não aceitam número em notação exponencial nem com mais de 32 caracteres.", parametro);
            }

            // O CHECK do banco mede octet_length(jsonb::text): o jsonb escreve ": " e ", " (com espaço), então um objeto compacto
            // perto de 16 KB estoura no banco. Mede-se aqui o MESMO texto, para recusar com 400 antes de gravar (e sem a linha
            // inteira no erro do banco).
            if (TamanhoNormalizado(documento.RootElement) > TamanhoMaximoBytes)
            {
                throw new ArgumentException($"As opções do cronograma excedem {TamanhoMaximoBytes} bytes.", parametro);
            }
        }
        catch (JsonException)
        {
            // Texto malformado ou além da profundidade: a mensagem do parser não vai ao cliente.
            throw new ArgumentException("As opções do cronograma devem ser um objeto JSON válido, com até 16 níveis.", parametro);
        }

        return json;
    }

    /// <summary>Igualdade semântica de dois textos JSON já validados (chaves em qualquer ordem; números pelo valor).</summary>
    public static bool Iguais(string a, string b)
    {
        using var da = JsonDocument.Parse(a, new JsonDocumentOptions { MaxDepth = ProfundidadeMaxima });
        using var db = JsonDocument.Parse(b, new JsonDocumentOptions { MaxDepth = ProfundidadeMaxima });
        return Iguais(da.RootElement, db.RootElement);
    }

    #endregion

    #region Métodos privados

    // Bytes do texto que o jsonb devolve: objetos e listas com ": " e ", ", textos com o escape mínimo (aspas, barra e controles).
    private static long TamanhoNormalizado(JsonElement elemento)
    {
        long total;
        switch (elemento.ValueKind)
        {
            case JsonValueKind.Object:
                total = 2;
                foreach (var propriedade in elemento.EnumerateObject())
                {
                    total += BytesDoTexto(propriedade.Name) + 2 + TamanhoNormalizado(propriedade.Value) + 2;
                }

                return total > 2 ? total - 2 : total;
            case JsonValueKind.Array:
                total = 2;
                foreach (var item in elemento.EnumerateArray())
                {
                    total += TamanhoNormalizado(item) + 2;
                }

                return total > 2 ? total - 2 : total;
            case JsonValueKind.String:
                return BytesDoTexto(elemento.GetString()!);
            default:
                // Número, true, false e null: ASCII.
                return elemento.GetRawText().Length;
        }
    }

    private static long BytesDoTexto(string texto)
    {
        long bytes = 2;
        foreach (var simbolo in texto.EnumerateRunes())
        {
            bytes += simbolo.Value switch
            {
                '"' or '\\' => 2,
                '\n' or '\r' or '\t' or '\b' or '\f' => 2,
                < 0x20 => 6,
                _ => simbolo.Utf8SequenceLength,
            };
        }

        return bytes;
    }

    private static bool TemNumeroQueExplodeNoJsonb(JsonElement elemento)
    {
        switch (elemento.ValueKind)
        {
            case JsonValueKind.Object:
                return elemento.EnumerateObject().Any(p => TemNumeroQueExplodeNoJsonb(p.Value));
            case JsonValueKind.Array:
                return elemento.EnumerateArray().Any(TemNumeroQueExplodeNoJsonb);
            case JsonValueKind.Number:
                var texto = elemento.GetRawText();
                return texto.Length > LimiteDoNumeroEmCaracteres || texto.Contains('e', StringComparison.OrdinalIgnoreCase);
            default:
                return false;
        }
    }

    private static bool TemCaractereNulo(JsonElement elemento)
    {
        switch (elemento.ValueKind)
        {
            case JsonValueKind.Object:
                return elemento.EnumerateObject().Any(p => p.Name.Contains('\0', StringComparison.Ordinal) || TemCaractereNulo(p.Value));
            case JsonValueKind.Array:
                return elemento.EnumerateArray().Any(TemCaractereNulo);
            case JsonValueKind.String:
                return elemento.GetString()!.Contains('\0', StringComparison.Ordinal);
            default:
                return false;
        }
    }

    private static bool Iguais(JsonElement a, JsonElement b)
    {
        if (a.ValueKind != b.ValueKind)
        {
            return false;
        }

        switch (a.ValueKind)
        {
            case JsonValueKind.Object:
                var propriedadesA = a.EnumerateObject().ToList();
                var propriedadesB = b.EnumerateObject().ToList();
                if (propriedadesA.Count != propriedadesB.Count)
                {
                    return false;
                }

                foreach (var propriedade in propriedadesA)
                {
                    if (!b.TryGetProperty(propriedade.Name, out var outro) || !Iguais(propriedade.Value, outro))
                    {
                        return false;
                    }
                }

                return true;
            case JsonValueKind.Array:
                var itensA = a.EnumerateArray().ToList();
                var itensB = b.EnumerateArray().ToList();
                return itensA.Count == itensB.Count && itensA.Zip(itensB).All(par => Iguais(par.First, par.Second));
            case JsonValueKind.String:
                return string.Equals(a.GetString(), b.GetString(), StringComparison.Ordinal);
            case JsonValueKind.Number:
                return a.TryGetDecimal(out var da) && b.TryGetDecimal(out var db)
                    ? da == db
                    : string.Equals(a.GetRawText(), b.GetRawText(), StringComparison.Ordinal);
            default:
                // true, false e null: o tipo igual já basta.
                return true;
        }
    }

    #endregion
}
