using Microsoft.AspNetCore.Authorization;

namespace CronoAI.Api.Sessao;

/// <summary>Satisfaz o requisito quando o <see cref="ContextoSessao"/> da requisição tem empresa ativa.</summary>
public sealed class TratadorRequisitoEmpresaAtiva : AuthorizationHandler<RequisitoEmpresaAtiva>
{
    #region Campos

    private readonly ContextoSessao _contexto;

    #endregion

    #region Construtor

    public TratadorRequisitoEmpresaAtiva(ContextoSessao contexto)
    {
        _contexto = contexto;
    }

    #endregion

    #region Métodos protegidos

    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, RequisitoEmpresaAtiva requirement)
    {
        if (_contexto.EmpresaId is not null)
        {
            context.Succeed(requirement);
        }
        else
        {
            context.Fail(new AuthorizationFailureReason(this, RequisitoEmpresaAtiva.MotivoEmpresaAtivaNecessaria));
        }

        return Task.CompletedTask;
    }

    #endregion
}
