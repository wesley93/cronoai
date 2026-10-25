namespace CronoAI.Api.Testes.Infra;

/// <summary>Um contêiner PostgreSQL por coleção; os testes de integração a compartilham.</summary>
[CollectionDefinition(Nome)]
public sealed class ColecaoBanco : ICollectionFixture<BancoPostgresFixture>
{
    public const string Nome = "Banco";
}
