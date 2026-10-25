using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>sessao</c>: RLS forçado por <c>usuario_id</c>. A FK composta (empresa_ativa_id, usuario_id) →
/// membro_empresa garante que a empresa ativa é uma empresa do usuário (MATCH SIMPLE: nulo não confere).
/// </summary>
public sealed class SessaoConfiguracao : IEntityTypeConfiguration<Sessao>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<Sessao> builder)
    {
        builder.ToTable("sessao", t =>
        {
            t.HasCheckConstraint("ck_sessao_expira_apos_criada", "expira_em > criada_em");
            t.HasCheckConstraint("ck_sessao_encerrada_apos_criada", "encerrada_em IS NULL OR encerrada_em >= criada_em");
        });
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).ValueGeneratedNever();
        builder.Property(s => s.UsuarioId).IsRequired();
        builder.Property(s => s.CriadaEm).IsRequired();
        builder.Property(s => s.ExpiraEm).IsRequired();
        builder.HasIndex(s => s.UsuarioId).HasDatabaseName("ix_sessao_usuario_id");
        builder.HasOne<Usuario>().WithMany().HasForeignKey(s => s.UsuarioId).HasConstraintName("fk_sessao_usuario");

        // Ordem das colunas igual à da PK de membro_empresa (serve de índice do lado referenciado).
        builder.HasOne<MembroEmpresa>()
            .WithMany()
            .HasForeignKey(s => new { s.EmpresaAtivaId, s.UsuarioId })
            .HasPrincipalKey(m => new { m.EmpresaId, m.UsuarioId })
            .HasConstraintName("fk_sessao_membro_empresa")
            .IsRequired(false);
    }

    #endregion
}
