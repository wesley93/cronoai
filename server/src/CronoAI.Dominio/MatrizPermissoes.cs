namespace CronoAI.Dominio;

/// <summary>
/// Matriz perfil × ação (SPEC-02, seção 3; plano 00014, seção 3.5). Regra de negócio pura, sem dependência: o banco decide
/// QUAIS obras o membro vê (RLS) e esta matriz decide O QUE ele pode fazer. Sem padrão implícito: ação ou perfil
/// desconhecido LANÇA (falha fechada), nunca devolve "não permitido" em silêncio. Mudar uma célula exige mudar o teste
/// <c>Matriz_igual_a_tabela_do_plano</c> de propósito.
/// </summary>
public static class MatrizPermissoes
{
    #region Campos

    private static readonly Dictionary<string, HashSet<string>> _porPerfil = Montar();

    #endregion

    #region Métodos públicos

    /// <summary>O perfil pode executar a ação? Lança <see cref="ArgumentException"/> se perfil ou ação não existem.</summary>
    public static bool Permite(string perfil, string acao)
    {
        var acoes = AcoesDo(perfil);
        if (!AcoesPermissao.EhValida(acao))
        {
            throw new ArgumentException("Ação desconhecida.", nameof(acao));
        }

        return acoes.Contains(acao);
    }

    /// <summary>Ações do perfil, para o teste que compara com a tabela literal do plano. Lança se o perfil não existe.</summary>
    public static IReadOnlySet<string> AcoesDo(string perfil)
    {
        return _porPerfil.TryGetValue(perfil ?? "", out var acoes)
            ? acoes
            : throw new ArgumentException("Perfil desconhecido.", nameof(perfil));
    }

    #endregion

    #region Métodos privados

    private static Dictionary<string, HashSet<string>> Montar()
    {
        return new Dictionary<string, HashSet<string>>(StringComparer.Ordinal)
        {
            // Criar obra e gerir usuários: administrador (SPEC-02 seção 3). Tudo o que o plano define neste ciclo.
            [Perfis.Administrador] = Conjunto([.. AcoesPermissao.Todas]),

            // "Tudo na obra", mas o cadastro (nome, UF, município, responsável, SINAPI) é do administrador (Q5 e Q7).
            [Perfis.EngenheiroPlanejamento] = Conjunto(
                AcoesPermissao.ObrasLer,
                AcoesPermissao.ObrasEditar,
                AcoesPermissao.TrilhaLer),

            // Não altera linha de base nem o cadastro da obra: lê a obra e a trilha das obras vinculadas.
            [Perfis.EngenheiroObra] = Conjunto(
                AcoesPermissao.ObrasLer,
                AcoesPermissao.TrilhaLer),

            // Menor privilégio [opinião]: a trilha leva custos e motivos de obra.
            [Perfis.Suprimentos] = Conjunto(AcoesPermissao.ObrasLer),

            [Perfis.Encarregado] = Conjunto(AcoesPermissao.ObrasLer),

            // Vê o portfólio e atribui obras a engenheiros (SPEC-02 seção 3); o alcance é do RLS.
            [Perfis.GestorPortfolio] = Conjunto(
                AcoesPermissao.ObrasLer,
                AcoesPermissao.TrilhaLer,
                AcoesPermissao.MembrosLer,
                AcoesPermissao.AcessosObraLer,
                AcoesPermissao.AcessosObraGerir),

            // Dashboards e relatórios [opinião]: a trilha traz o motivo em texto livre.
            [Perfis.Diretoria] = Conjunto(AcoesPermissao.ObrasLer),
        };
    }

    private static HashSet<string> Conjunto(params string[] acoes) => new(acoes, StringComparer.Ordinal);

    #endregion
}
