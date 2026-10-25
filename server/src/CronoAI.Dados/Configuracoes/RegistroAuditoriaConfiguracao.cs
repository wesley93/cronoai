using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>auditoria</c>: append-only em três camadas na migração (REVOKE, RLS só com SELECT e INSERT e gatilho de
/// instrução com ENABLE ALWAYS; ADR 00009). Sem coluna de IP (ciclo 00013, Q6). O <c>id</c> é identity e a ordem de
/// leitura é (em, id).
/// </summary>
public sealed class RegistroAuditoriaConfiguracao : IEntityTypeConfiguration<RegistroAuditoria>
{
    #region Campos

    private const int LimiteJsonBytes = 262144;

    #endregion

    #region Métodos públicos

    public void Configure(EntityTypeBuilder<RegistroAuditoria> builder)
    {
        builder.ToTable("auditoria", t =>
        {
            t.HasCheckConstraint("ck_auditoria_entidade", "entidade ~ '^[a-z_]{1,64}$'");
            t.HasCheckConstraint("ck_auditoria_acao", "acao IN ('criar', 'alterar', 'arquivar', 'restaurar')");
            t.HasCheckConstraint("ck_auditoria_origem", "origem IN ('ui', 'importacao', 'whatsapp', 'api')");
            t.HasCheckConstraint("ck_auditoria_motivo_tamanho", $"motivo IS NULL OR char_length(motivo) <= {RegistroAuditoria.TamanhoMaximoMotivo}");
            t.HasCheckConstraint("ck_auditoria_antes_objeto", "antes IS NULL OR jsonb_typeof(antes) = 'object'");
            t.HasCheckConstraint("ck_auditoria_depois_objeto", "depois IS NULL OR jsonb_typeof(depois) = 'object'");
            t.HasCheckConstraint("ck_auditoria_antes_tamanho", $"antes IS NULL OR octet_length(antes::text) <= {LimiteJsonBytes}");
            t.HasCheckConstraint("ck_auditoria_depois_tamanho", $"depois IS NULL OR octet_length(depois::text) <= {LimiteJsonBytes}");
        });

        builder.HasKey(a => a.Id).HasName("pk_auditoria");
        builder.Property(a => a.Id).UseIdentityAlwaysColumn();
        builder.Property(a => a.EmpresaId).IsRequired();
        builder.Property(a => a.ObraId);
        builder.Property(a => a.UsuarioId).IsRequired();
        builder.Property(a => a.Entidade).IsRequired();
        builder.Property(a => a.EntidadeId).IsRequired();
        builder.Property(a => a.Acao).IsRequired();
        builder.Property(a => a.Antes).HasColumnType("jsonb");
        builder.Property(a => a.Depois).HasColumnType("jsonb");
        builder.Property(a => a.VersaoDepois);
        builder.Property(a => a.Origem).IsRequired();
        builder.Property(a => a.Motivo);
        builder.Property(a => a.CorrelacaoId);
        builder.Property(a => a.Em).IsRequired();

        // Mesma empresa da obra, garantida pelo banco (MATCH SIMPLE: sem obra, sem checagem).
        builder.HasOne<Obra>()
            .WithMany()
            .HasForeignKey(a => new { a.EmpresaId, a.ObraId })
            .HasPrincipalKey(o => new { o.EmpresaId, o.Id })
            .HasConstraintName("fk_auditoria_obra")
            .IsRequired(false);
        builder.HasOne<Usuario>().WithMany().HasForeignKey(a => a.UsuarioId).HasConstraintName("fk_auditoria_usuario");

        // Também a empresa tem FK: linha de trilha sem obra (entidades futuras) não pode apontar para empresa inexistente.
        builder.HasOne<Empresa>().WithMany().HasForeignKey(a => a.EmpresaId).HasConstraintName("fk_auditoria_empresa");

        // Leitura e exportação por empresa e por obra: sempre do mais novo para o mais antigo, desempate pelo id.
        builder.HasIndex(a => new { a.EmpresaId, a.Em, a.Id })
            .IsDescending(false, true, true)
            .HasDatabaseName("ix_auditoria_empresa_em");
        builder.HasIndex(a => new { a.EmpresaId, a.ObraId, a.Em, a.Id })
            .IsDescending(false, false, true, true)
            .HasDatabaseName("ix_auditoria_empresa_obra_em");
        builder.HasIndex(a => a.UsuarioId).HasDatabaseName("ix_auditoria_usuario_id");

        // Exportação: empresa + intervalo de em + id > cursor, ordenada por id (keyset de id). O (empresa_id, em, id) acima serve
        // à leitura por tempo; este serve à ordem por id sem ordenar a empresa inteira (parecer do dba, rodada 02).
        builder.HasIndex(a => new { a.EmpresaId, a.Id }).HasDatabaseName("ix_auditoria_empresa_id");
    }

    #endregion
}
