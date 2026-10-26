using System.Diagnostics;
using CronoAI.Api.Borda;
using CronoAI.Api.Sessao;
using CronoAI.Dominio;
using Microsoft.AspNetCore.Http.HttpResults;

namespace CronoAI.Api.Obras;

/// <summary>
/// Obras da empresa ativa. A empresa e o usuário vêm SEMPRE da sessão (nunca do corpo nem da URL); obra de outra empresa
/// responde 404 idêntico ao de inexistente, nunca 403 nem 409. "Apagar" é arquivar: não há rota <c>DELETE</c>.
/// Escrita leva <c>versao</c> no corpo (concorrência otimista): versão velha, obra arquivada e nome repetido são 409.
/// </summary>
public static class ObrasEndpoints
{
    #region Campos

    // Corpo de escrita de obra: 64 KB (o maior campo, opcoes_cronograma, tem 16 KB).
    private const long LimiteDoCorpoEmBytes = 65536;

    #endregion

    #region Métodos públicos

    public static RouteGroupBuilder MapearObras(this RouteGroupBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);
        var grupo = api.MapGroup("/obras").RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva);

        // A coleção fica fora do grupo: um MapGet("") dentro dele registra o padrão com barra final ("/api/v1/obras/"), e o
        // catálogo de isolamento (e o contrato) usam "/api/v1/obras".
        api.MapGet("/obras", async Task<Ok<IReadOnlyList<ObraResposta>>> (ServicoObras servico, CancellationToken cancelamento, bool incluirArquivadas = false) =>
                TypedResults.Ok(await servico.ListarAsync(incluirArquivadas, cancelamento)))
            .RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva)
            .RequerPermissao(AcoesPermissao.ObrasLer)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        grupo.MapGet("/{id}", async Task<Results<Ok<ObraResposta>, ProblemHttpResult>> (Guid id, ServicoObras servico, CancellationToken cancelamento) =>
            {
                var obra = await servico.ObterAsync(id, cancelamento);
                return obra is null ? NaoEncontrada() : TypedResults.Ok(obra);
            })
            .RequerPermissao(AcoesPermissao.ObrasLer)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        api.MapPost("/obras", async Task<Results<Created<ObraResposta>, ValidationProblem, ProblemHttpResult>> (CriarObraRequisicao requisicao, ServicoObras servico, CancellationToken cancelamento) =>
            {
                var resultado = await servico.CriarAsync(requisicao, cancelamento);
                return resultado.Status switch
                {
                    StatusResultadoObra.Ok => TypedResults.Created($"/api/v1/obras/{resultado.Obra!.Id}", resultado.Obra),
                    StatusResultadoObra.Invalida => TypedResults.ValidationProblem(resultado.Erros!),
                    StatusResultadoObra.Conflito => Conflito(resultado),

                    // Criar não carrega nada: não há obra "não encontrada" aqui. Se aparecer, é defeito, e o 500 genérico o denuncia.
                    _ => throw new UnreachableException($"Criar obra não devolve {resultado.Status}."),
                };
            })
            .RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva)
            .RequerPermissao(AcoesPermissao.ObrasCriar)
            .WithMetadata(new LimiteDeCorpoMetadata(LimiteDoCorpoEmBytes))
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        grupo.MapPut("/{id}", async Task<Results<Ok<ObraResposta>, ValidationProblem, ProblemHttpResult>> (Guid id, AtualizarObraRequisicao requisicao, ServicoObras servico, CancellationToken cancelamento) =>
                Traduzir(await servico.AtualizarAsync(id, requisicao, cancelamento)))
            .RequerPermissao(AcoesPermissao.ObrasEditar)
            .WithMetadata(new LimiteDeCorpoMetadata(LimiteDoCorpoEmBytes))
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        grupo.MapPost("/{id}/arquivar", async Task<Results<Ok<ObraResposta>, ValidationProblem, ProblemHttpResult>> (Guid id, MudancaArquivamentoRequisicao requisicao, ServicoObras servico, CancellationToken cancelamento) =>
                Traduzir(await servico.ArquivarAsync(id, requisicao, cancelamento)))
            .RequerPermissao(AcoesPermissao.ObrasArquivar)
            .WithMetadata(new LimiteDeCorpoMetadata(LimiteDoCorpoEmBytes))
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        grupo.MapPost("/{id}/restaurar", async Task<Results<Ok<ObraResposta>, ValidationProblem, ProblemHttpResult>> (Guid id, MudancaArquivamentoRequisicao requisicao, ServicoObras servico, CancellationToken cancelamento) =>
                Traduzir(await servico.RestaurarAsync(id, requisicao, cancelamento)))
            .RequerPermissao(AcoesPermissao.ObrasArquivar)
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

    // Escritas sobre obra existente: 200 com a obra, 400 por campo, 404 ou 409 (com o estado atual quando visível).
    private static Results<Ok<ObraResposta>, ValidationProblem, ProblemHttpResult> Traduzir(ResultadoEscritaObra resultado) => resultado.Status switch
    {
        StatusResultadoObra.Ok => TypedResults.Ok(resultado.Obra!),
        StatusResultadoObra.Invalida => TypedResults.ValidationProblem(resultado.Erros!),
        StatusResultadoObra.NaoEncontrada => NaoEncontrada(),
        StatusResultadoObra.CampoNaoPermitido => CampoNaoPermitido(resultado),
        _ => Conflito(resultado),
    };

    // 403 de campo de cadastro: type curto e só os NOMES dos campos (nunca o valor enviado nem o atual).
    private static ProblemHttpResult CampoNaoPermitido(ResultadoEscritaObra resultado) =>
        TypedResults.Problem(
            statusCode: StatusCodes.Status403Forbidden,
            title: "O seu perfil não pode alterar estes campos de cadastro da obra.",
            type: ResultadoEscritaObra.CampoNaoPermitidoTipo,
            extensions: new Dictionary<string, object?> { ["campos"] = resultado.CamposNaoPermitidos });

    private static ProblemHttpResult NaoEncontrada() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Recurso não encontrado.");

    // ProblemDetails (RFC 9457) com type curto e, quando a obra é visível, a extensão estadoAtual.
    private static ProblemHttpResult Conflito(ResultadoEscritaObra resultado)
    {
        var titulo = resultado.TipoDoConflito switch
        {
            ResultadoEscritaObra.ConflitoDeVersao => "A obra foi alterada por outra pessoa. Recarregue e tente de novo.",
            ResultadoEscritaObra.ObraArquivada => "A obra está arquivada.",
            ResultadoEscritaObra.ObraNaoArquivada => "A obra não está arquivada.",
            ResultadoEscritaObra.ObraNomeDuplicado => "Já existe uma obra ativa com esse nome.",
            _ => "Conflito com o estado atual.",
        };

        IDictionary<string, object?>? extensoes = resultado.EstadoAtual is { } estado
            ? new Dictionary<string, object?> { ["estadoAtual"] = estado }
            : null;
        return TypedResults.Problem(statusCode: StatusCodes.Status409Conflict, title: titulo, type: resultado.TipoDoConflito, extensions: extensoes);
    }

    #endregion
}
