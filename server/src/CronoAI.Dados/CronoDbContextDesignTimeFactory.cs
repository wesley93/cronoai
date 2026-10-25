using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace CronoAI.Dados;

/// <summary>
/// Factory usada só pelo <c>dotnet ef</c>. Lê a string do migrador do ambiente; não há valor
/// padrão (e portanto nenhuma senha) no código. Na CI usa-se uma string fictícia sem senha,
/// suficiente para construir o modelo (<c>has-pending-model-changes</c> não abre conexão).
/// O contexto de banco é vazio: o modelo das migrações é o mesmo de execução.
/// </summary>
public sealed class CronoDbContextDesignTimeFactory : IDesignTimeDbContextFactory<CronoDbContext>
{
    #region Campos

    private const string VariavelConexao = "ConnectionStrings__CronoaiMigracao";

    #endregion

    #region Métodos públicos

    public CronoDbContext CreateDbContext(string[] args)
    {
        var stringConexao = Environment.GetEnvironmentVariable(VariavelConexao);
        if (string.IsNullOrWhiteSpace(stringConexao))
        {
            throw new InvalidOperationException(
                $"Defina a variável de ambiente {VariavelConexao} com a conexão do papel {PapeisBanco.Migrador} (veja server/README.md).");
        }

        var opcoes = new DbContextOptionsBuilder<CronoDbContext>();
        CronoDbContextConfiguracao.Configurar(opcoes, stringConexao);
        return new CronoDbContext(opcoes.Options, ContextoSessaoBanco.Vazio);
    }

    #endregion
}
