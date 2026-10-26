using Microsoft.AspNetCore.Authorization;

namespace CronoAI.Api.Sessao;

/// <summary>
/// Exige que o PERFIL do membro (da sessão) possa executar a ação (<see cref="CronoAI.Dominio.MatrizPermissoes"/>). Uma política
/// de autorização por ação, declarada na rota (<see cref="PoliticasPermissao"/>), somada à política de empresa ativa. O banco
/// decide QUAIS obras (RLS); este requisito decide O QUE o perfil faz. Falha com 403 <c>acao-nao-permitida</c>, antes de
/// carregar o recurso: o mesmo 403 para qualquer <c>{id}</c> (existente, alheio ou inexistente), sem revelar existência.
/// </summary>
public sealed class RequisitoPermissao : IAuthorizationRequirement
{
    #region Campos

    /// <summary>Motivo de falha lido pelo tratador de resultado para responder 403 com o tipo certo.</summary>
    public const string MotivoAcaoNaoPermitida = "acao-nao-permitida";

    #endregion

    #region Construtor

    public RequisitoPermissao(string acao)
    {
        Acao = acao;
    }

    #endregion

    #region Propriedades

    /// <summary>Ação da matriz (<see cref="CronoAI.Dominio.AcoesPermissao"/>).</summary>
    public string Acao { get; }

    #endregion
}
