using Microsoft.AspNetCore.Authorization;

namespace CronoAI.Api.Sessao;

/// <summary>Exige empresa ativa na sessão (política <see cref="PoliticaEmpresaAtiva"/>), nas rotas de dado de empresa.</summary>
public sealed class RequisitoEmpresaAtiva : IAuthorizationRequirement
{
    #region Campos

    /// <summary>Nome da política que carrega este requisito.</summary>
    public const string PoliticaEmpresaAtiva = "EmpresaAtiva";

    /// <summary>Motivo de falha lido pelo tratador de resultado para responder 403 com o tipo certo.</summary>
    public const string MotivoEmpresaAtivaNecessaria = "empresa-ativa-necessaria";

    #endregion
}
