namespace CronoAI.Dominio;

/// <summary>
/// Vínculo que só se insere ou apaga (<c>acesso_obra</c>, <c>acesso_frente</c>, <c>carteira_obra</c> e
/// <c>acesso_carteira</c>): o <c>DELETE</c> físico é permitido e grava a ação <c>remover</c> na trilha, com o estado em
/// <c>antes</c>. Qualquer outra entidade auditável continua LANÇANDO ao ser removida (ADR 00009).
/// </summary>
public interface IVinculoRemovivel : IAuditavel
{
}
