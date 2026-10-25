using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>obra</c>: RLS forçado (políticas na migração) e filtro "Empresa" automático. <c>versao</c> é um contador
/// incrementado por GATILHO (ADR 00009): o EF só a lê de volta e a usa como token de concorrência. O índice único
/// parcial do nome (<c>ux_obra_empresa_nome_ativa</c>, por expressão) não é expresso pelo EF e vive só na migração;
/// quem o protege é o teste de banco.
/// </summary>
public sealed class ObraConfiguracao : IEntityTypeConfiguration<Obra>
{
    #region Campos

    /// <summary>Sombra: 2 primeiros dígitos do código do município (coluna gerada), alvo da FK composta com a UF.</summary>
    public const string MunicipioUfCod = "MunicipioUfCod";

    #endregion

    #region Métodos públicos

    public void Configure(EntityTypeBuilder<Obra> builder)
    {
        builder.ToTable("obra", t =>
        {
            t.HasCheckConstraint("ck_obra_nome_tamanho", $"char_length(nome) BETWEEN 1 AND {Obra.TamanhoMaximoNome}");
            t.HasCheckConstraint("ck_obra_municipio_formato", "municipio_ibge ~ '^[0-9]{7}$'");
            t.HasCheckConstraint("ck_obra_sinapi_regime", "sinapi_regime IS NULL OR sinapi_regime IN ('desonerado', 'nao_desonerado')");
            t.HasCheckConstraint("ck_obra_sinapi_data_base_dia_1", "sinapi_data_base IS NULL OR EXTRACT(DAY FROM sinapi_data_base) = 1");
            t.HasCheckConstraint(
                "ck_obra_sinapi_tudo_ou_nada",
                "(sinapi_uf IS NULL) = (sinapi_regime IS NULL) AND (sinapi_uf IS NULL) = (sinapi_data_base IS NULL)");
            t.HasCheckConstraint("ck_obra_opcoes_objeto", "jsonb_typeof(opcoes_cronograma) = 'object'");
            t.HasCheckConstraint("ck_obra_opcoes_tamanho", "octet_length(opcoes_cronograma::text) <= 16384");
            t.HasCheckConstraint("ck_obra_versao_positiva", "versao >= 1");
            t.HasCheckConstraint("ck_obra_atualizada_apos_criada", "atualizada_em >= criada_em");
            t.HasCheckConstraint("ck_obra_arquivada_apos_criada", "arquivada_em IS NULL OR arquivada_em >= criada_em");
        });

        builder.HasKey(o => o.Id).HasName("pk_obra");
        builder.Property(o => o.Id).ValueGeneratedNever();
        builder.Property(o => o.EmpresaId).IsRequired();
        builder.Property(o => o.Nome).IsRequired();
        builder.Property(o => o.Uf).IsRequired();
        builder.Property(o => o.MunicipioIbge).IsRequired();
        builder.Property(o => o.ResponsavelId);
        builder.Property(o => o.DataStatus).HasColumnType("date");
        builder.Property(o => o.SinapiUf);
        builder.Property(o => o.SinapiRegime);
        builder.Property(o => o.SinapiDataBase).HasColumnType("date");
        builder.Property(o => o.OpcoesCronograma).IsRequired().HasColumnType("jsonb").HasDefaultValueSql("'{}'::jsonb");
        builder.Property(o => o.CriadaEm).IsRequired();
        builder.Property(o => o.AtualizadaEm).IsRequired();
        builder.Property(o => o.ArquivadaEm);
        builder.Ignore(o => o.EstaArquivada);

        // Token de concorrência: nasce 1 por default; o gatilho BEFORE UPDATE soma 1 e ignora o valor enviado. O Npgsql
        // lê o valor de volta por RETURNING (ValueGeneratedOnAddOrUpdate), então a entidade sai do SaveChanges atualizada.
        builder.Property(o => o.Versao).IsConcurrencyToken().ValueGeneratedOnAddOrUpdate().HasDefaultValue(1L);

        // Coluna gerada STORED: o EF nunca a escreve. A expressão não falha com texto fora do formato (o CHECK é quem
        // recusa); o CASE existe porque a ordem de avaliação entre CHECK e coluna gerada não é garantida.
        builder.Property<short?>(MunicipioUfCod)
            .HasColumnName("municipio_uf_cod")
            .HasComputedColumnSql("CASE WHEN municipio_ibge ~ '^[0-9]{7}$' THEN substr(municipio_ibge, 1, 2)::smallint END", stored: true);

        // Identidade e criação são imutáveis depois de gravadas (defesa em profundidade; o WITH CHECK do RLS também
        // impede mover a obra de empresa).
        builder.Property(o => o.Id).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);
        builder.Property(o => o.EmpresaId).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);
        builder.Property(o => o.CriadaEm).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);

        // (empresa_id, id) é o alvo das FKs compostas da trilha (e dos ciclos seguintes).
        builder.HasAlternateKey(o => new { o.EmpresaId, o.Id }).HasName("ux_obra_empresa_id_id");

        builder.HasOne<Empresa>().WithMany().HasForeignKey(o => o.EmpresaId).HasConstraintName("fk_obra_empresa");
        builder.HasOne<UfReferencia>().WithMany().HasForeignKey(o => o.Uf).HasPrincipalKey(u => u.Sigla).HasConstraintName("fk_obra_uf");
        builder.HasOne<UfReferencia>().WithMany().HasForeignKey(o => o.SinapiUf).HasPrincipalKey(u => u.Sigla).HasConstraintName("fk_obra_sinapi_uf").IsRequired(false);

        // Prefixo do município × UF: (uf, municipio_uf_cod) → uf_referencia (sigla, codigo_ibge), na ordem da chave alvo.
        builder.HasOne<UfReferencia>()
            .WithMany()
            .HasForeignKey(nameof(Obra.Uf), MunicipioUfCod)
            .HasPrincipalKey(nameof(UfReferencia.Sigla), nameof(UfReferencia.CodigoIbge))
            .HasConstraintName("fk_obra_municipio_uf");

        // Responsável: nulo ou membro DA MESMA empresa (MATCH SIMPLE: nulo não confere). A FK ignora o RLS.
        builder.HasOne<MembroEmpresa>()
            .WithMany()
            .HasForeignKey(o => new { o.EmpresaId, o.ResponsavelId })
            .HasPrincipalKey(m => new { m.EmpresaId, m.UsuarioId })
            .HasConstraintName("fk_obra_responsavel")
            .IsRequired(false);
    }

    #endregion
}
