namespace CronoAI.Dados;

/// <summary>
/// Contexto de segurança de UM <see cref="CronoDbContext"/>: usuário e empresa que o RLS e o filtro do EF
/// enxergam. Imutável (record sem setters) e fixado no construtor do contexto: uma conexão aberta nunca
/// vê o contexto mudar (ADR 00006). Sem valor = nenhuma linha.
/// </summary>
public sealed record ContextoSessaoBanco(Guid? UsuarioId, Guid? EmpresaId)
{
    #region Propriedades

    /// <summary>Sem usuário e sem empresa: o RLS e o filtro do EF devolvem zero linhas.</summary>
    public static ContextoSessaoBanco Vazio { get; } = new(null, null);

    #endregion

    #region Métodos públicos

    public static ContextoSessaoBanco DoUsuario(Guid usuarioId) => new(usuarioId, null);

    public static ContextoSessaoBanco DaEmpresa(Guid empresaId) => new(null, empresaId);

    #endregion
}
