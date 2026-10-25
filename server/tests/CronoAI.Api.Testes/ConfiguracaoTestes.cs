using System.Text.RegularExpressions;

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

    #endregion

    #region Métodos privados

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
