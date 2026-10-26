using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>acesso_obra</c>: vínculo membro × obra, RLS forçado. O vínculo só se insere ou apaga (UPDATE revogado na
/// migração). <c>(obra_id, usuario_id)</c> é único e é o alvo da FK de <c>acesso_frente</c>.
/// </summary>
public sealed class AcessoObraConfiguracao : IEntityTypeConfiguration<AcessoObra>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<AcessoObra> builder)
    {
        builder.ToTable("acesso_obra");
        builder.HasKey(a => a.Id).HasName("pk_acesso_obra");
        builder.Property(a => a.Id).ValueGeneratedNever();
        builder.Property(a => a.EmpresaId).IsRequired();
        builder.Property(a => a.ObraId).IsRequired();
        builder.Property(a => a.UsuarioId).IsRequired();
        builder.Property(a => a.CriadoEm).IsRequired();
        builder.Property(a => a.CriadoEm).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);

        // Alvo da FK de acesso_frente (quem tem frente tem a obra).
        builder.HasAlternateKey(a => new { a.ObraId, a.UsuarioId }).HasName("ux_acesso_obra_obra_usuario");

        builder.HasOne<Obra>()
            .WithMany()
            .HasForeignKey(a => new { a.EmpresaId, a.ObraId })
            .HasPrincipalKey(o => new { o.EmpresaId, o.Id })
            .HasConstraintName("fk_acesso_obra_obra");
        builder.HasOne<MembroEmpresa>()
            .WithMany()
            .HasForeignKey(a => new { a.EmpresaId, a.UsuarioId })
            .HasPrincipalKey(m => new { m.EmpresaId, m.UsuarioId })
            .HasConstraintName("fk_acesso_obra_membro");

        // Minhas obras (subconsulta não correlacionada da política) e o lado referenciador da FK composta da obra.
        builder.HasIndex(a => new { a.UsuarioId, a.ObraId }).HasDatabaseName("ix_acesso_obra_usuario");
        builder.HasIndex(a => new { a.EmpresaId, a.ObraId }).HasDatabaseName("ix_acesso_obra_empresa_obra");
    }

    #endregion
}
