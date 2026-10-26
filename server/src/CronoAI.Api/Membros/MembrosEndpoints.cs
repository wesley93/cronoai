using System.Diagnostics;
using System.Security.Claims;
using CronoAI.Api.Borda;
using CronoAI.Api.Sessao;
using CronoAI.Dominio;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;

namespace CronoAI.Api.Membros;

/// <summary>
/// Gestão de membros da empresa ativa. A empresa e o usuário que escreve vêm SEMPRE da sessão; o membro alvo vem da URL e, se for de
/// outra empresa ou não existir, responde 404 idêntico. Listar exige <c>membros.ler</c> (administrador e gestor de portfólio); incluir
/// removidos, trocar perfil, remover e reativar exigem <c>membros.gerir</c> (só o administrador). Escrita leva <c>versao</c> no corpo
/// (concorrência otimista sobre o <c>xmin</c>): versão velha, último administrador, membro responsável, removido e não removido são 409.
/// </summary>
public static class MembrosEndpoints
{
    #region Campos

    // Corpo de escrita de membro: 8 KB (perfil, escopo, versão e um motivo de até 500 caracteres cabem com folga).
    private const long LimiteDoCorpoEmBytes = 8192;

    #endregion

    #region Métodos públicos

    public static RouteGroupBuilder MapearMembros(this RouteGroupBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);

        // A coleção fica fora do grupo (barra final no padrão), como as obras.
        api.MapGet("/membros", async Task<Results<Ok<IReadOnlyList<MembroResposta>>, ProblemHttpResult>> (ClaimsPrincipal usuario, IAuthorizationService autorizacao, ServicoMembros servico, CancellationToken cancelamento, bool incluirRemovidos = false) =>
            {
                // Listar removidos é gerir: o perfil que só LÊ (gestor de portfólio) recebe 403, como em qualquer ação fora da matriz.
                // EXCEÇÃO ÀS REGRAS DA ROTA (uma ação por rota, 403 antes do handler): a ação depende de um parâmetro de consulta, então
                // a segunda ação é conferida AQUI, mas pela MESMA política por ação (IAuthorizationService), e não por uma cópia da
                // matriz. Registrada em backend-dotnet.md e no ADR 00010.
                if (incluirRemovidos && !(await autorizacao.AuthorizeAsync(usuario, PoliticasPermissao.Nome(AcoesPermissao.MembrosGerir))).Succeeded)
                {
                    return TypedResults.Problem(
                        statusCode: StatusCodes.Status403Forbidden,
                        title: "O seu perfil não permite esta ação.",
                        type: RequisitoPermissao.MotivoAcaoNaoPermitida);
                }

                return TypedResults.Ok(await servico.ListarAsync(incluirRemovidos, cancelamento));
            })
            .RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva)
            .RequerPermissao(AcoesPermissao.MembrosLer)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        var grupo = api.MapGroup("/membros").RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva);

        grupo.MapPut("/{usuarioId}", async Task<Results<Ok<MembroResposta>, ValidationProblem, ProblemHttpResult>> (Guid usuarioId, AlterarMembroRequisicao requisicao, ServicoMembros servico, CancellationToken cancelamento) =>
                Traduzir(await servico.AlterarAsync(usuarioId, requisicao, cancelamento)))
            .RequerPermissao(AcoesPermissao.MembrosGerir)
            .WithMetadata(new LimiteDeCorpoMetadata(LimiteDoCorpoEmBytes))
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        grupo.MapPost("/{usuarioId}/remover", async Task<Results<Ok<MembroResposta>, ValidationProblem, ProblemHttpResult>> (Guid usuarioId, MudancaMembroRequisicao requisicao, ServicoMembros servico, CancellationToken cancelamento) =>
                Traduzir(await servico.RemoverAsync(usuarioId, requisicao, cancelamento)))
            .RequerPermissao(AcoesPermissao.MembrosGerir)
            .WithMetadata(new LimiteDeCorpoMetadata(LimiteDoCorpoEmBytes))
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        grupo.MapPost("/{usuarioId}/reativar", async Task<Results<Ok<MembroResposta>, ValidationProblem, ProblemHttpResult>> (Guid usuarioId, MudancaMembroRequisicao requisicao, ServicoMembros servico, CancellationToken cancelamento) =>
                Traduzir(await servico.ReativarAsync(usuarioId, requisicao, cancelamento)))
            .RequerPermissao(AcoesPermissao.MembrosGerir)
            .WithMetadata(new LimiteDeCorpoMetadata(LimiteDoCorpoEmBytes))
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        return api;
    }

    #endregion

    #region Métodos privados

    // Escritas sobre membro existente: 200 com o membro, 400 por campo (ou perfil-indisponivel), 404 ou 409.
    private static Results<Ok<MembroResposta>, ValidationProblem, ProblemHttpResult> Traduzir(ResultadoEscritaMembro resultado) => resultado.Status switch
    {
        StatusResultadoMembro.Ok => TypedResults.Ok(resultado.Membro!),
        StatusResultadoMembro.Invalida => TypedResults.ValidationProblem(resultado.Erros!),
        StatusResultadoMembro.PerfilIndisponivel => TypedResults.Problem(
            statusCode: StatusCodes.Status400BadRequest,
            title: "Este perfil ainda não pode ser atribuído.",
            type: ResultadoEscritaMembro.PerfilIndisponivelTipo),
        StatusResultadoMembro.NaoEncontrado => NaoEncontrado(),
        StatusResultadoMembro.Conflito => Conflito(resultado),
        _ => throw new UnreachableException($"Escrita de membro não devolve {resultado.Status}."),
    };

    private static ProblemHttpResult NaoEncontrado() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Recurso não encontrado.");

    // ProblemDetails (RFC 9457) com type curto; estadoAtual quando o membro é visível; obras e frentes só com ids.
    private static ProblemHttpResult Conflito(ResultadoEscritaMembro resultado)
    {
        var titulo = resultado.TipoDoConflito switch
        {
            ResultadoEscritaMembro.ConflitoDeVersao => "O membro foi alterado por outra pessoa. Recarregue e tente de novo.",
            ResultadoEscritaMembro.UltimoAdministrador => "A empresa precisa de ao menos um administrador ativo.",
            ResultadoEscritaMembro.MembroResponsavel => "O membro é responsável por obras ou frentes: reatribua a responsabilidade antes.",
            ResultadoEscritaMembro.MembroRemovido => "O membro está removido.",
            ResultadoEscritaMembro.MembroNaoRemovido => "O membro não está removido.",
            _ => "Conflito com o estado atual.",
        };

        var extensoes = new Dictionary<string, object?>();
        if (resultado.EstadoAtual is { } estado)
        {
            extensoes["estadoAtual"] = estado;
        }

        if (resultado.Obras is { } obras)
        {
            extensoes["obras"] = obras;
        }

        if (resultado.Frentes is { } frentes)
        {
            extensoes["frentes"] = frentes;
        }

        return TypedResults.Problem(statusCode: StatusCodes.Status409Conflict, title: titulo, type: resultado.TipoDoConflito, extensions: extensoes.Count > 0 ? extensoes : null);
    }

    #endregion
}
