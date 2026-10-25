using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>uf_referencia</c>: lista global (fora do RLS), semeada pela migração e só com SELECT para a aplicação.
/// A chave alternativa (sigla, codigo_ibge) é o alvo da FK composta do município da obra.
/// </summary>
public sealed class UfReferenciaConfiguracao : IEntityTypeConfiguration<UfReferencia>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<UfReferencia> builder)
    {
        builder.ToTable("uf_referencia", t => t.HasCheckConstraint("ck_uf_referencia_sigla", "sigla ~ '^[A-Z]{2}$'"));
        builder.HasKey(u => u.Sigla).HasName("pk_uf_referencia");
        builder.Property(u => u.Sigla).ValueGeneratedNever();
        builder.Property(u => u.CodigoIbge).IsRequired().ValueGeneratedNever();
        builder.Property(u => u.Nome).IsRequired();
        builder.HasAlternateKey(u => new { u.Sigla, u.CodigoIbge }).HasName("ux_uf_referencia_sigla_codigo");
        builder.HasIndex(u => u.CodigoIbge).IsUnique().HasDatabaseName("ux_uf_referencia_codigo");
    }

    #endregion
}
