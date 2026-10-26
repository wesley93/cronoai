namespace CronoAI.Dados.Rls;

/// <summary>
/// Fragmentos SQL das políticas de RLS por obra (ciclo 00014, plano seção 3.3). Ficam SÓ aqui, para as migrações e o teste
/// de catálogo nunca copiarem à mão (um predicado digitado duas vezes diverge). <c>E</c> e <c>U</c> são as subconsultas
/// escalares da empresa e do usuário do contexto (<see cref="MigrationBuilderRlsExtensoes"/>); todos os nomes de tabela
/// vão qualificados (<c>cronoai.</c>). O banco decide VISIBILIDADE (quais obras); a ação (o que o perfil pode fazer) é da
/// matriz na aplicação. Este arquivo é autorizado a montar SQL de RLS (regra R15).
/// REGRA DE RECURSÃO (PostgreSQL, erro 42P17): a política de uma tabela citada pela política de <c>obra</c>
/// (<c>membro_empresa</c>, <c>acesso_obra</c>, <c>carteira_obra</c>, <c>carteira</c>, <c>acesso_carteira</c>) NUNCA cita
/// <c>obra</c>; e nenhuma política de <c>membro_empresa</c> cita <c>membro_empresa</c>. Por isso o alcance do gestor repete
/// o caminho das carteiras em vez de consultar <c>obra</c>.
/// </summary>
public static class ExpressoesPermissao
{
    #region Campos

    private static readonly string _empresa = MigrationBuilderRlsExtensoes.ExpressaoEmpresa;

    private static readonly string _usuario = MigrationBuilderRlsExtensoes.ExpressaoUsuario;

    #endregion

    #region Propriedades

    /// <summary>O usuário do contexto é administrador ATIVO da empresa do contexto.</summary>
    public static string Admin { get; } = Meu("m.perfil = 'administrador'");

    /// <summary>O usuário do contexto é gestor de portfólio ATIVO da empresa do contexto.</summary>
    public static string Gestor { get; } = Meu("m.perfil = 'gestor_portfolio'");

    /// <summary>O usuário do contexto tem escopo <c>todas</c> (enxerga todas as obras da empresa).</summary>
    public static string Todas { get; } = Meu("m.escopo_obras = 'todas'");

    /// <summary>Obras vinculadas ao usuário por <c>acesso_obra</c> (só vale para escopo <c>vinculadas</c>).</summary>
    public static string ObrasVinculadas { get; } =
        "SELECT a.obra_id FROM cronoai.acesso_obra a "
        + "JOIN cronoai.membro_empresa m ON m.empresa_id = a.empresa_id AND m.usuario_id = a.usuario_id "
        + $"WHERE a.empresa_id = {_empresa} AND a.usuario_id = {_usuario} AND m.removido_em IS NULL AND m.escopo_obras = 'vinculadas'";

    /// <summary>Carteiras atribuídas ao usuário por <c>acesso_carteira</c> (só vale para escopo <c>carteiras</c>).</summary>
    public static string CarteirasMinhas { get; } =
        "SELECT ac.carteira_id FROM cronoai.acesso_carteira ac "
        + "JOIN cronoai.membro_empresa m ON m.empresa_id = ac.empresa_id AND m.usuario_id = ac.usuario_id "
        + $"WHERE ac.empresa_id = {_empresa} AND ac.usuario_id = {_usuario} AND m.removido_em IS NULL AND m.escopo_obras = 'carteiras'";

    /// <summary>Obras das carteiras do usuário; carteira arquivada não concede acesso (Q4).</summary>
    public static string ObrasDasCarteiras { get; } =
        "SELECT co.obra_id FROM cronoai.carteira_obra co "
        + "JOIN cronoai.carteira c ON c.empresa_id = co.empresa_id AND c.id = co.carteira_id AND c.arquivada_em IS NULL "
        + $"WHERE co.empresa_id = {_empresa} AND co.carteira_id IN ({CarteirasMinhas})";

    #endregion

    #region Métodos públicos

    /// <summary>
    /// Predicado de visibilidade da própria obra (<c>pol_obra_select</c>, e o <c>USING</c>/<c>WITH CHECK</c> do UPDATE): da
    /// empresa do contexto e (escopo <c>todas</c>, ou vinculada, ou de uma carteira atribuída).
    /// </summary>
    public static string VisibilidadeDaObra() =>
        $"empresa_id = {_empresa} AND ({Todas} OR id IN ({ObrasVinculadas}) OR id IN ({ObrasDasCarteiras}))";

    /// <summary>
    /// Alcance do gestor de portfólio sobre a coluna de obra: ele precisa ser gestor e (ter escopo <c>todas</c> ou a obra estar
    /// numa carteira dele). Repete o caminho das carteiras em vez de consultar <c>obra</c> (recursão, ver o resumo da classe).
    /// </summary>
    public static string AlcanceGestor(string colunaObra) =>
        $"({Gestor} AND ({Todas} OR {colunaObra} IN ({ObrasDasCarteiras})))";

    /// <summary>
    /// A obra da coluna é visível ao usuário, passando pelo RLS da própria obra. Subconsulta NÃO correlacionada (avaliada uma
    /// vez por consulta). Só para tabela que a política de <c>obra</c> NÃO cita (<c>frente</c>, <c>auditoria</c>).
    /// </summary>
    public static string ObraVisivel(string colunaObra) => $"{colunaObra} IN (SELECT o.id FROM cronoai.obra o)";

    #endregion

    #region Métodos privados

    // EXISTS do vínculo ativo do usuário na empresa do contexto, com a condição extra sobre o alias "m".
    private static string Meu(string condicao) =>
        "EXISTS (SELECT 1 FROM cronoai.membro_empresa m "
        + $"WHERE m.empresa_id = {_empresa} AND m.usuario_id = {_usuario} AND m.removido_em IS NULL AND {condicao})";

    #endregion
}
