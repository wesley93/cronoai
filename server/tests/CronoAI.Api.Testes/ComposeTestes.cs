using System.Text.RegularExpressions;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes;

/// <summary>
/// O Dependabot (ecossistema docker-compose) só atualiza o YAML: sem este teste a imagem do compose e a da
/// fixture divergiriam em silêncio e os testes deixariam de provar o que roda no desenvolvimento.
/// </summary>
public sealed partial class ComposeTestes
{
    #region Métodos públicos

    [Fact]
    public void Imagem_e_initdb_do_compose_batem_com_a_fixture()
    {
        var servicoDb = LerServicoDb();

        var imagem = ImagemRegex().Match(servicoDb);
        var initdb = InitdbRegex().Match(servicoDb);

        Assert.True(imagem.Success, "image: do serviço db não encontrada no docker-compose.yml");
        Assert.True(initdb.Success, "POSTGRES_INITDB_ARGS do serviço db não encontrado no docker-compose.yml");
        Assert.Equal(BancoPostgresFixture.Imagem, imagem.Groups["valor"].Value);
        Assert.Equal(BancoPostgresFixture.ArgumentosInitdb, initdb.Groups["valor"].Value);
    }

    #endregion

    #region Métodos privados

    // Trecho do serviço "db": de "  db:" até o próximo bloco de 2 espaços (ou bloco de topo).
    private static string LerServicoDb()
    {
        var pasta = new DirectoryInfo(AppContext.BaseDirectory);
        while (pasta is not null && !File.Exists(Path.Combine(pasta.FullName, "docker-compose.yml")))
        {
            pasta = pasta.Parent;
        }

        var caminho = pasta is null
            ? throw new InvalidOperationException("docker-compose.yml não encontrado acima do binário de teste.")
            : Path.Combine(pasta.FullName, "docker-compose.yml");
        var texto = File.ReadAllText(caminho);

        var inicio = texto.IndexOf("\n  db:\n", StringComparison.Ordinal);
        Assert.True(inicio >= 0, "serviço db não encontrado no docker-compose.yml");
        var proximo = ProximoBlocoRegex().Match(texto, inicio + 1 + "  db:\n".Length);
        return proximo.Success ? texto[inicio..proximo.Index] : texto[inicio..];
    }

    [GeneratedRegex(@"^\s+image:\s*(?<valor>\S+)\s*$", RegexOptions.Multiline)]
    private static partial Regex ImagemRegex();

    [GeneratedRegex(@"^\s+POSTGRES_INITDB_ARGS:\s*""(?<valor>[^""]+)""\s*$", RegexOptions.Multiline)]
    private static partial Regex InitdbRegex();

    [GeneratedRegex(@"^(?:  \S|\S)", RegexOptions.Multiline)]
    private static partial Regex ProximoBlocoRegex();

    #endregion
}
