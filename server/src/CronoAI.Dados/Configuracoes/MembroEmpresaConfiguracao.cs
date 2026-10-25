using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>Tabela <c>membro_empresa</c>: PK (empresa_id, usuario_id), RLS forçado, filtro "Empresa" automático.</summary>
public sealed class MembroEmpresaConfiguracao : IEntityTypeConfiguration<MembroEmpresa>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<MembroEmpresa> builder)
    {
        builder.ToTable("membro_empresa");
        builder.HasKey(m => new { m.EmpresaId, m.UsuarioId });
        builder.Property(m => m.CriadoEm).IsRequired();
        builder.HasIndex(m => m.UsuarioId).HasDatabaseName("ix_membro_empresa_usuario_id");
        builder.HasOne<Empresa>().WithMany().HasForeignKey(m => m.EmpresaId).HasConstraintName("fk_membro_empresa_empresa");
        builder.HasOne<Usuario>().WithMany().HasForeignKey(m => m.UsuarioId).HasConstraintName("fk_membro_empresa_usuario");
    }

    #endregion
}
