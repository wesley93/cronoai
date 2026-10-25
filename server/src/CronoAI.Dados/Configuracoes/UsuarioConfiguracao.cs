using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>Tabela <c>usuario</c>: fora do RLS, aceito com condições (ADR 00006). Único por (emissor, sujeito).</summary>
public sealed class UsuarioConfiguracao : IEntityTypeConfiguration<Usuario>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<Usuario> builder)
    {
        builder.ToTable("usuario", t =>
        {
            t.HasCheckConstraint("ck_usuario_emissor_tamanho", $"char_length(emissor) BETWEEN 1 AND {Usuario.TamanhoMaximoEmissor}");
            t.HasCheckConstraint("ck_usuario_sujeito_tamanho", $"char_length(sujeito) BETWEEN 1 AND {Usuario.TamanhoMaximoSujeito}");
            t.HasCheckConstraint("ck_usuario_nome_tamanho", $"nome_exibicao IS NULL OR char_length(nome_exibicao) <= {Usuario.TamanhoMaximoNome}");
        });
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Id).ValueGeneratedNever();
        builder.Property(u => u.Emissor).IsRequired();
        builder.Property(u => u.Sujeito).IsRequired();
        builder.Property(u => u.NomeExibicao);
        builder.Property(u => u.CriadoEm).IsRequired();
        builder.Property(u => u.UltimoAcessoEm).IsRequired();
        builder.Property(u => u.DesativadoEm);
        builder.HasIndex(u => new { u.Emissor, u.Sujeito }).IsUnique().HasDatabaseName("ux_usuario_emissor_sujeito");
    }

    #endregion
}
