using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>carteira</c>: RLS forçado; <c>versao</c> por gatilho. O índice único parcial
/// <c>ux_carteira_empresa_tipo_nome_ativa</c> (por expressão) vive só na migração.
/// </summary>
public sealed class CarteiraConfiguracao : IEntityTypeConfiguration<Carteira>
{
    #region Campos

    private static readonly string _tipos = string.Join(", ", TiposCarteira.Todos.Select(t => $"'{t}'"));

    #endregion

    #region Métodos públicos

    public void Configure(EntityTypeBuilder<Carteira> builder)
    {
        builder.ToTable("carteira", t =>
        {
            t.HasCheckConstraint("ck_carteira_nome_tamanho", $"char_length(nome) BETWEEN 1 AND {Carteira.TamanhoMaximoNome}");
            t.HasCheckConstraint("ck_carteira_tipo", $"tipo IN ({_tipos})");
            t.HasCheckConstraint("ck_carteira_versao_positiva", "versao >= 1");
            t.HasCheckConstraint("ck_carteira_atualizada_apos_criada", "atualizada_em >= criada_em");
            t.HasCheckConstraint("ck_carteira_arquivada_apos_criada", "arquivada_em IS NULL OR arquivada_em >= criada_em");
        });

        builder.HasKey(c => c.Id).HasName("pk_carteira");
        builder.Property(c => c.Id).ValueGeneratedNever();
        builder.Property(c => c.EmpresaId).IsRequired();
        builder.Property(c => c.Nome).IsRequired();
        builder.Property(c => c.Tipo).IsRequired();
        builder.Property(c => c.CriadaEm).IsRequired();
        builder.Property(c => c.AtualizadaEm).IsRequired();
        builder.Property(c => c.ArquivadaEm);
        builder.Property(c => c.Versao).IsConcurrencyToken().ValueGeneratedOnAddOrUpdate().HasDefaultValue(1L);

        builder.Property(c => c.CriadaEm).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);

        builder.HasAlternateKey(c => new { c.EmpresaId, c.Id }).HasName("ux_carteira_empresa_id_id");
        builder.HasOne<Empresa>().WithMany().HasForeignKey(c => c.EmpresaId).HasConstraintName("fk_carteira_empresa");
    }

    #endregion
}
