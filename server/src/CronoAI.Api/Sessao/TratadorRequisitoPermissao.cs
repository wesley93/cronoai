using CronoAI.Dominio;
using Microsoft.AspNetCore.Authorization;

namespace CronoAI.Api.Sessao;

/// <summary>
/// Satisfaz o <see cref="RequisitoPermissao"/> quando a matriz permite a ação ao perfil da sessão. O perfil vem da consulta que
/// valida a sessão (nunca do cliente). Sem empresa ativa não decide nada: quem responde é a política de empresa ativa, com o
/// motivo dela (403 <c>empresa-ativa-necessaria</c>).
/// </summary>
public sealed class TratadorRequisitoPermissao : AuthorizationHandler<RequisitoPermissao>
{
    #region Campos

    private readonly ContextoSessao _contexto;

    #endregion

    #region Construtor

    public TratadorRequisitoPermissao(ContextoSessao contexto)
    {
        _contexto = contexto;
    }

    #endregion

    #region Métodos protegidos

    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, RequisitoPermissao requirement)
    {
        if (_contexto.EmpresaId is null)
        {
            return Task.CompletedTask;
        }

        // Perfil ausente com empresa ativa é defeito (a validação da sessão o entrega): falha fechada, nunca permite.
        if (_contexto.Perfil is { } perfil && MatrizPermissoes.Permite(perfil, requirement.Acao))
        {
            context.Succeed(requirement);
        }
        else
        {
            context.Fail(new AuthorizationFailureReason(this, RequisitoPermissao.MotivoAcaoNaoPermitida));
        }

        return Task.CompletedTask;
    }

    #endregion
}
