namespace CronoAI.Api.Testes;

public sealed class ConfiguracaoTestes
{
    #region Métodos públicos

    [Fact]
    public void Appsettings_sem_senha()
    {
        var pastaSrc = Path.Combine(RaizServidor(), "src");
        var arquivos = Directory.GetFiles(pastaSrc, "appsettings*.json", SearchOption.AllDirectories)
            .Where(a => !a.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !a.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .ToList();

        Assert.NotEmpty(arquivos);
        foreach (var arquivo in arquivos)
        {
            var texto = File.ReadAllText(arquivo);
            Assert.DoesNotContain("Password=", texto, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Pwd=", texto, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Senha", texto, StringComparison.OrdinalIgnoreCase);
        }
    }

    #endregion

    #region Métodos privados

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
