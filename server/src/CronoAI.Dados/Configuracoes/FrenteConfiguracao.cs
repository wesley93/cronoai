using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>frente</c>: RLS forçado. <c>versao</c> por GATILHO (função genérica <c>incrementa_versao</c>), como a obra. O
/// índice único parcial do nome (<c>ux_frente_obra_nome_ativa</c>, por expressão) não é expresso pelo EF e vive só na
/// migração; quem o protege é o teste de banco.
/// </summary>
public sealed class FrenteConfiguracao : IEntityTypeConfiguration<Frente>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<Frente> builder)
    {
        builder.ToTable("frente", t =>
        {
            t.HasCheckConstraint("ck_frente_nome_tamanho", $"char_length(nome) BETWEEN 1 AND {Frente.TamanhoMaximoNome}");
            t.HasCheckConstraint(
                "ck_frente_responsavel_texto",
                $"responsavel_texto IS NULL OR (char_length(responsavel_texto) BETWEEN 1 AND {Frente.TamanhoMaximoResponsavelTexto} AND responsavel_texto !~ '[[:cntrl:]]')");

            // No máximo um responsável: membro OU texto livre (Q2).
            t.HasCheckConstraint("ck_frente_responsavel_um_so", "responsavel_id IS NULL OR responsavel_texto IS NULL");
            t.HasCheckConstraint("ck_frente_versao_positiva", "versao >= 1");
            t.HasCheckConstraint("ck_frente_atualizada_apos_criada", "atualizada_em >= criada_em");
            t.HasCheckConstraint("ck_frente_arquivada_apos_criada", "arquivada_em IS NULL OR arquivada_em >= criada_em");
        });

        builder.HasKey(f => f.Id).HasName("pk_frente");
        builder.Property(f => f.Id).ValueGeneratedNever();
        builder.Property(f => f.EmpresaId).IsRequired();
        builder.Property(f => f.ObraId).IsRequired();
        builder.Property(f => f.Nome).IsRequired();
        builder.Property(f => f.ResponsavelId);
        builder.Property(f => f.ResponsavelTexto);
        builder.Property(f => f.CriadaEm).IsRequired();
        builder.Property(f => f.AtualizadaEm).IsRequired();
        builder.Property(f => f.ArquivadaEm);
        builder.Property(f => f.Versao).IsConcurrencyToken().ValueGeneratedOnAddOrUpdate().HasDefaultValue(1L);

        builder.Property(f => f.CriadaEm).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);

        // Alvo da FK de acesso_frente: garante que o obra_id do vínculo bate com o da frente.
        builder.HasAlternateKey(f => new { f.EmpresaId, f.ObraId, f.Id }).HasName("ux_frente_empresa_obra_id");

        builder.HasOne<Obra>()
            .WithMany()
            .HasForeignKey(f => new { f.EmpresaId, f.ObraId })
            .HasPrincipalKey(o => new { o.EmpresaId, o.Id })
            .HasConstraintName("fk_frente_obra");

        // Responsável: nulo ou membro DA MESMA empresa (MATCH SIMPLE: nulo não confere). A FK ignora o RLS.
        builder.HasOne<MembroEmpresa>()
            .WithMany()
            .HasForeignKey(f => new { f.EmpresaId, f.ResponsavelId })
            .HasPrincipalKey(m => new { m.EmpresaId, m.UsuarioId })
            .HasConstraintName("fk_frente_responsavel")
            .IsRequired(false);

        builder.HasIndex(f => new { f.EmpresaId, f.ObraId }).HasDatabaseName("ix_frente_empresa_obra");
    }

    #endregion
}
