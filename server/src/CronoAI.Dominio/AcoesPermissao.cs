namespace CronoAI.Dominio;

/// <summary>
/// Ações que a matriz perfil × ação (<see cref="MatrizPermissoes"/>) controla. Cada rota de dado declara exatamente uma
/// (teste de arquitetura). O alcance (QUAIS obras) não está aqui: é do RLS no banco. As ações de frentes e carteiras
/// entram com o ciclo 00014b.
/// </summary>
public static class AcoesPermissao
{
    #region Campos

    public const string ObrasLer = "obras.ler";

    public const string ObrasCriar = "obras.criar";

    /// <summary>Só <c>dataStatus</c> e <c>opcoesCronograma</c>.</summary>
    public const string ObrasEditar = "obras.editar";

    /// <summary>Nome, UF, município, responsável e SINAPI.</summary>
    public const string ObrasEditarCadastro = "obras.editar_cadastro";

    /// <summary>Arquivar e restaurar.</summary>
    public const string ObrasArquivar = "obras.arquivar";

    public const string TrilhaLer = "trilha.ler";

    public const string TrilhaExportar = "trilha.exportar";

    public const string MembrosLer = "membros.ler";

    /// <summary>Trocar perfil, remover, reativar e listar removidos.</summary>
    public const string MembrosGerir = "membros.gerir";

    public const string AcessosObraLer = "acessos_obra.ler";

    public const string AcessosObraGerir = "acessos_obra.gerir";

    private static readonly string[] _todas =
    [
        ObrasLer,
        ObrasCriar,
        ObrasEditar,
        ObrasEditarCadastro,
        ObrasArquivar,
        TrilhaLer,
        TrilhaExportar,
        MembrosLer,
        MembrosGerir,
        AcessosObraLer,
        AcessosObraGerir,
    ];

    #endregion

    #region Propriedades

    public static IReadOnlyList<string> Todas => _todas;

    #endregion

    #region Métodos públicos

    public static bool EhValida(string? acao) => acao is not null && _todas.Contains(acao, StringComparer.Ordinal);

    #endregion
}
