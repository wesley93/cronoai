using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>acesso_frente</c>: vínculo membro × frente, RLS forçado, só se insere ou apaga. A FK para <c>acesso_obra</c>
/// garante que quem tem frente tem a obra: revogar a obra exige apagar antes os vínculos de frente (o <c>Restrict</c>
/// impede esquecer).
/// </summary>
public sealed class AcessoFrenteConfiguracao : IEntityTypeConfiguration<AcessoFrente>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<AcessoFrente> builder)
    {
        builder.ToTable("acesso_frente");
        builder.HasKey(a => a.Id).HasName("pk_acesso_frente");
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.EmpresaId).IsRequired();
        builder.Property(a => a.ObraId).IsRequired();
        builder.Property(a => a.FrenteId).IsRequired();
        builder.Property(a => a.UsuarioId).IsRequired();
        builder.Property(a => a.CriadoEm).IsRequired();
        builder.Property(a => a.CriadoEm).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);

        builder.HasAlternateKey(a => new { a.FrenteId, a.UsuarioId }).HasName("ux_acesso_frente_frente_usuario");

        builder.HasOne<Frente>()
            .WithMany()
            .HasForeignKey(a => new { a.EmpresaId, a.ObraId, a.FrenteId })
            .HasPrincipalKey(f => new { f.EmpresaId, f.ObraId, f.Id })
            .HasConstraintName("fk_acesso_frente_frente");
        builder.HasOne<AcessoObra>()
            .WithMany()
            .HasForeignKey(a => new { a.ObraId, a.UsuarioId })
            .HasPrincipalKey(a => new { a.ObraId, a.UsuarioId })
            .HasConstraintName("fk_acesso_frente_acesso_obra");

        builder.HasIndex(a => new { a.UsuarioId, a.FrenteId }).HasDatabaseName("ix_acesso_frente_usuario");
    }

    #endregion
}
