using System.Text.Json;
using System.Text.RegularExpressions;
using CronoAI.Api.Testes.Infra;
using Microsoft.Extensions.Options;

namespace CronoAI.Api.Testes;

public sealed partial class ConfiguracaoTestes
{
    #region Métodos públicos

    [Fact]
    public void Json_do_servidor_sem_senha()
    {
        // Varre todo *.json de server/src (appsettings*, launchSettings, etc.), exceto bin/obj.
        var pastaSrc = Path.Combine(RaizServidor(), "src");
        var arquivos = Directory.GetFiles(pastaSrc, "*.json", SearchOption.AllDirectories)
            .Where(a => !a.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !a.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !a.EndsWith("packages.lock.json", StringComparison.Ordinal))
            .ToList();

        Assert.Contains(arquivos, a => a.EndsWith("appsettings.json", StringComparison.Ordinal));
        foreach (var arquivo in arquivos)
        {
            var texto = File.ReadAllText(arquivo);
            Assert.False(SenhaRegex().IsMatch(texto), $"possível senha em {Path.GetFileName(arquivo)}");
            Assert.DoesNotContain("Senha", texto, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void Appsettings_sem_segredo_do_cliente_nem_flag_de_desenvolvimento()
    {
        // Nenhum *.json versionado de server/src com SegredoCliente preenchido nem a flag do usuário de desenvolvimento ligada.
        var pastaSrc = Path.Combine(RaizServidor(), "src");
        var arquivos = Directory.GetFiles(pastaSrc, "*.json", SearchOption.AllDirectories)
            .Where(a => !a.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !a.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !a.EndsWith("packages.lock.json", StringComparison.Ordinal));

        foreach (var arquivo in arquivos)
        {
            using var documento = JsonDocument.Parse(File.ReadAllText(arquivo));
            foreach (var (nome, valor) in Propriedades(documento.RootElement))
            {
                if (nome.Equals("SegredoCliente", StringComparison.OrdinalIgnoreCase))
                {
                    Assert.True(valor.ValueKind != JsonValueKind.String || string.IsNullOrEmpty(valor.GetString()), $"SegredoCliente preenchido em {Path.GetFileName(arquivo)}");
                }

                if (nome.Equals("Habilitado", StringComparison.OrdinalIgnoreCase))
                {
                    Assert.True(valor.ValueKind != JsonValueKind.True, $"flag Habilitado=true em {Path.GetFileName(arquivo)}");
                }
            }
        }
    }

    [Fact]
    public void No_reset_on_close_impede_a_partida()
    {
        // A guarda protege a segunda rede contra vazamento de variável de sessão no pool (ADR 00006).
        using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco + ";No Reset On Close=true") { Logs = new LogsEmMemoria() };

        var texto = PartidaDoHost.ExigirFalha(fabrica, "No Reset On Close");

        Assert.Contains("OptionsValidationException", texto, StringComparison.Ordinal);
        Assert.Contains("No Reset On Close", texto, StringComparison.Ordinal);
    }

    #endregion

    #region Métodos privados

    private static IEnumerable<(string Nome, JsonElement Valor)> Propriedades(JsonElement elemento)
    {
        if (elemento.ValueKind == JsonValueKind.Object)
        {
            foreach (var propriedade in elemento.EnumerateObject())
            {
                yield return (propriedade.Name, propriedade.Value);
                foreach (var filha in Propriedades(propriedade.Value))
                {
                    yield return filha;
                }
            }
        }
        else if (elemento.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in elemento.EnumerateArray())
            {
                foreach (var filha in Propriedades(item))
                {
                    yield return filha;
                }
            }
        }
    }

    [GeneratedRegex(@"(password|pwd)\s*=", RegexOptions.IgnoreCase)]
    private static partial Regex SenhaRegex();

    // Sobe do binário até a pasta que contém CronoAI.slnx (a raiz de server/).
    private static string RaizServidor()
    {
        var pasta = new DirectoryInfo(AppContext.BaseDirectory);
        while (pasta is not null && !File.Exists(Path.Combine(pasta.FullName, "CronoAI.slnx")))
        {
            pasta = pasta.Parent;
        }

        return pasta?.FullName ?? throw new InvalidOperationException("CronoAI.slnx não encontrado acima do binário de teste.");
    }

    #endregion
}
