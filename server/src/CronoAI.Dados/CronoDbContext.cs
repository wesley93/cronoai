using Microsoft.EntityFrameworkCore;

namespace CronoAI.Dados;

/// <summary>
/// Contexto do EF Core do CronoAI. Sem entidades neste ciclo (00011): só a base de schema e
/// convenções que os ciclos seguintes herdam (ADR 00004).
/// </summary>
public class CronoDbContext : DbContext
{
    #region Construtor

    public CronoDbContext(DbContextOptions<CronoDbContext> options)
        : base(options)
    {
    }

    #endregion

    #region Métodos protegidos

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Schema próprio: alvo exato para GRANT/REVOKE e pg_dump -n; trocar depois reescreve todas as migrações.
        modelBuilder.HasDefaultSchema(PapeisBanco.Schema);
    }

    #endregion
}
