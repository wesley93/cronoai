using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>Tabela <c>empresa</c>: RLS forçado (políticas na migração). Sem CNPJ.</summary>
public sealed class EmpresaConfiguracao : IEntityTypeConfiguration<Empresa>
{
    #region Métodos públicos

    public void Configure(EntityTypeBuilder<Empresa> builder)
    {
        builder.ToTable("empresa", t => t.HasCheckConstraint(
            "ck_empresa_nome_tamanho",
            $"char_length(nome) BETWEEN 1 AND {Empresa.TamanhoMaximoNome}"));
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).ValueGeneratedNever();
        builder.Property(e => e.Nome).IsRequired();
        builder.Property(e => e.CriadaEm).IsRequired();
    }

    #endregion
}
