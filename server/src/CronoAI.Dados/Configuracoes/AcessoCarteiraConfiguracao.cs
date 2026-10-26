using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>Tabela <c>acesso_carteira</c>: RLS forçado, só se insere ou apaga.</summary>
public sealed class AcessoCarteiraConfiguracao : IEntityTypeConfiguration<AcessoCarteira>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<AcessoCarteira> builder)
    {
        builder.ToTable("acesso_carteira");
        builder.HasKey(a => a.Id).HasName("pk_acesso_carteira");
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.EmpresaId).IsRequired();
        builder.Property(a => a.CarteiraId).IsRequired();
        builder.Property(a => a.UsuarioId).IsRequired();
        builder.Property(a => a.CriadoEm).IsRequired();
        builder.Property(a => a.CriadoEm).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);

        builder.HasAlternateKey(a => new { a.CarteiraId, a.UsuarioId }).HasName("ux_acesso_carteira_carteira_usuario");

        builder.HasOne<Carteira>()
            .WithMany()
            .HasForeignKey(a => new { a.EmpresaId, a.CarteiraId })
            .HasPrincipalKey(c => new { c.EmpresaId, c.Id })
            .HasConstraintName("fk_acesso_carteira_carteira");
        builder.HasOne<MembroEmpresa>()
            .WithMany()
            .HasForeignKey(a => new { a.EmpresaId, a.UsuarioId })
            .HasPrincipalKey(m => new { m.EmpresaId, m.UsuarioId })
            .HasConstraintName("fk_acesso_carteira_membro");

        builder.HasIndex(a => new { a.UsuarioId, a.CarteiraId }).HasDatabaseName("ix_acesso_carteira_usuario");
    }

    #endregion
}
