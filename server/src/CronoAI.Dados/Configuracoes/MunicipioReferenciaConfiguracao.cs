using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>municipio_referencia</c>: lista global (fora do RLS), VAZIA até a carga oficial (Q7) e só com SELECT para
/// a aplicação. A obra NÃO tem FK para ela neste ciclo (uma FK recusaria toda obra com a tabela vazia).
/// </summary>
public sealed class MunicipioReferenciaConfiguracao : IEntityTypeConfiguration<MunicipioReferencia>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<MunicipioReferencia> builder)
    {
        builder.ToTable("municipio_referencia", t => t.HasCheckConstraint("ck_municipio_referencia_codigo", "codigo_ibge ~ '^[0-9]{7}$'"));
        builder.HasKey(m => m.CodigoIbge).HasName("pk_municipio_referencia");
        builder.Property(m => m.CodigoIbge).ValueGeneratedNever();
        builder.Property(m => m.Uf).IsRequired();
        builder.Property(m => m.Nome).IsRequired();
        builder.HasAlternateKey(m => new { m.CodigoIbge, m.Uf }).HasName("ux_municipio_referencia_codigo_uf");
        builder.HasOne<UfReferencia>().WithMany().HasForeignKey(m => m.Uf).HasPrincipalKey(u => u.Sigla).HasConstraintName("fk_municipio_referencia_uf");
    }

    #endregion
}
