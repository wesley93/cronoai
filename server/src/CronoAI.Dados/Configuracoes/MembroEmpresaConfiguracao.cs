using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CronoAI.Dados.Configuracoes;

/// <summary>
/// Tabela <c>membro_empresa</c>: PK (empresa_id, usuario_id), RLS forçado, filtro "Empresa" automático. O perfil e o escopo
/// de obras são texto + CHECK (os valores vêm das constantes do domínio: o teste de banco confere que o CHECK as repete).
/// <c>Versao</c> é o <c>xmin</c> (concorrência otimista de entidade sem filhos, ADR 00004). O papel da aplicação NÃO tem
/// <c>INSERT</c> (fecha a escalada de privilégio) e só atualiza as colunas <c>perfil</c>, <c>escopo_obras</c>,
/// <c>removido_em</c> e <c>atualizado_em</c>; o resto é imutável por privilégio e pelo EF.
/// </summary>
public sealed class MembroEmpresaConfiguracao : IEntityTypeConfiguration<MembroEmpresa>
{
    #region Campos

    private static readonly string _perfis = Lista(Perfis.Todos);

    private static readonly string _escopos = Lista(EscoposObras.Todos);

    #endregion

    #region Métodos públicos

    public void Configure(EntityTypeBuilder<MembroEmpresa> builder)
    {
        builder.ToTable("membro_empresa", t =>
        {
            t.HasCheckConstraint("ck_membro_perfil", $"perfil IN ({_perfis})");
            t.HasCheckConstraint("ck_membro_escopo", $"escopo_obras IN ({_escopos})");

            // O par perfil x escopo (mesma regra de Perfis.ParValido). O banco só cita "administrador" pelo nome; os outros
            // perfis aparecem aqui só para validar o par, não para decidir visibilidade.
            t.HasCheckConstraint(
                "ck_membro_perfil_escopo",
                "(perfil = 'administrador' AND escopo_obras = 'todas') "
                + "OR (perfil IN ('gestor_portfolio', 'diretoria') AND escopo_obras IN ('todas', 'carteiras')) "
                + "OR (perfil IN ('engenheiro_planejamento', 'engenheiro_obra', 'suprimentos', 'encarregado') AND escopo_obras = 'vinculadas')");
            t.HasCheckConstraint("ck_membro_removido_apos_criado", "removido_em IS NULL OR removido_em >= criado_em");
            t.HasCheckConstraint("ck_membro_atualizado_apos_criado", "atualizado_em >= criado_em");
        });

        // Nome explícito: as tabelas novas apontam para esta chave (FK composta) em configurações aplicadas ANTES desta, e o
        // EF nomearia a chave como "ak_..." (alternativa) em vez de manter "pk_membro_empresa".
        builder.HasKey(m => new { m.EmpresaId, m.UsuarioId }).HasName("pk_membro_empresa");
        builder.Property(m => m.Perfil).IsRequired();
        builder.Property(m => m.EscopoObras).IsRequired();
        builder.Property(m => m.RemovidoEm);
        builder.Property(m => m.CriadoEm).IsRequired();
        builder.Property(m => m.AtualizadoEm).IsRequired();
        builder.Ignore(m => m.EstaRemovido);

        // xmin: o Npgsql mapeia a propriedade uint de row version para a coluna de sistema (sem coluna na migração).
        builder.Property(m => m.Versao).IsRowVersion();

        // Criação imutável (defesa em profundidade; o privilégio por coluna também a impede).
        builder.Property(m => m.CriadoEm).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);

        builder.HasIndex(m => m.UsuarioId).HasDatabaseName("ix_membro_empresa_usuario_id");
        builder.HasOne<Empresa>().WithMany().HasForeignKey(m => m.EmpresaId).HasConstraintName("fk_membro_empresa_empresa");
        builder.HasOne<Usuario>().WithMany().HasForeignKey(m => m.UsuarioId).HasConstraintName("fk_membro_empresa_usuario");
    }

    #endregion

    #region Métodos privados

    private static string Lista(IEnumerable<string> valores) => string.Join(", ", valores.Select(v => $"'{v}'"));

    #endregion
}
