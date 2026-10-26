namespace CronoAI.Dominio;

/// <summary>
/// Entidade que se "apaga" arquivando (<c>arquivada_em</c>). Na trilha, a troca de <c>arquivada_em</c> entre nulo e valor
/// vira <c>arquivar</c> ou <c>restaurar</c>.
/// </summary>
public interface IArquivavel : IAuditavel
{
    #region Propriedades

    DateTime? ArquivadaEm { get; }

    #endregion
}
