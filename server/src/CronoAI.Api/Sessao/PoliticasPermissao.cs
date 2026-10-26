using CronoAI.Dominio;
using Microsoft.AspNetCore.Authorization;

namespace CronoAI.Api.Sessao;

/// <summary>
/// Registro de UMA política de autorização por ação da matriz e a extensão que a declara na rota
/// (<see cref="RequerPermissao{TBuilder}"/>). Toda rota de dado declara exatamente uma ação (teste de arquitetura): a
/// permissão fica visível na própria rota e testável por enumeração do <c>EndpointDataSource</c>.
/// </summary>
public static class PoliticasPermissao
{
    #region Campos

    private const string Prefixo = "Permissao:";

    #endregion

    #region Métodos públicos

    /// <summary>Nome da política da ação (<c>Permissao:obras.ler</c>).</summary>
    public static string Nome(string acao) => Prefixo + acao;

    /// <summary>Esta política é de permissão por ação?</summary>
    public static bool EhDePermissao(string? nome) => nome is not null && nome.StartsWith(Prefixo, StringComparison.Ordinal);

    /// <summary>Registra uma política por ação conhecida.</summary>
    public static AuthorizationBuilder AdicionarPoliticasDePermissao(this AuthorizationBuilder autorizacao)
    {
        ArgumentNullException.ThrowIfNull(autorizacao);
        foreach (var acao in AcoesPermissao.Todas)
        {
            autorizacao.AddPolicy(Nome(acao), politica => politica
                .RequireAuthenticatedUser()
                .AddRequirements(new RequisitoPermissao(acao)));
        }

        return autorizacao;
    }

    /// <summary>
    /// Declara a ação da matriz na rota, SOMADA à política de empresa ativa que a rota já exige (as duas valem). Ação desconhecida
    /// lança na montagem das rotas (falha na partida, não em produção).
    /// </summary>
    public static TBuilder RequerPermissao<TBuilder>(this TBuilder construtor, string acao)
        where TBuilder : IEndpointConventionBuilder
    {
        ArgumentNullException.ThrowIfNull(construtor);
        if (!AcoesPermissao.EhValida(acao))
        {
            throw new ArgumentException($"Ação desconhecida na rota: {acao}.", nameof(acao));
        }

        return construtor.RequireAuthorization(Nome(acao));
    }

    #endregion
}
