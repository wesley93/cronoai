using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>Tabela <c>carteira_obra</c> (N:N, Q4): RLS forçado, só se insere ou apaga.</summary>
public sealed class CarteiraObraConfiguracao : IEntityTypeConfiguration<CarteiraObra>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<CarteiraObra> builder)
    {
        builder.ToTable("carteira_obra");
        builder.HasKey(c => c.Id).HasName("pk_carteira_obra");
        builder.Property(c => c.Id).ValueGeneratedNever();
        builder.Property(c => c.EmpresaId).IsRequired();
        builder.Property(c => c.CarteiraId).IsRequired();
        builder.Property(c => c.ObraId).IsRequired();
        builder.Property(c => c.CriadoEm).IsRequired();
        builder.Property(c => c.CriadoEm).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);

        builder.HasAlternateKey(c => new { c.CarteiraId, c.ObraId }).HasName("ux_carteira_obra_carteira_obra");

        builder.HasOne<Carteira>()
            .WithMany()
            .HasForeignKey(c => new { c.EmpresaId, c.CarteiraId })
            .HasPrincipalKey(c => new { c.EmpresaId, c.Id })
            .HasConstraintName("fk_carteira_obra_carteira");
        builder.HasOne<Obra>()
            .WithMany()
            .HasForeignKey(c => new { c.EmpresaId, c.ObraId })
            .HasPrincipalKey(o => new { o.EmpresaId, o.Id })
            .HasConstraintName("fk_carteira_obra_obra");

        builder.HasIndex(c => new { c.ObraId, c.CarteiraId }).HasDatabaseName("ix_carteira_obra_obra");
    }

    #endregion
}
