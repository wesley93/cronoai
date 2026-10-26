using CronoAI.Dados.Identidade;
using CronoAI.Dominio;

namespace CronoAI.Api.Membros;

/// <summary>
/// Membro da empresa como a API o devolve (também é o <c>estadoAtual</c> dos 409). Só o mínimo: o nome de exibição é dado pessoal
/// e <b>nunca</b> sai com emissor, sujeito, e-mail nem IP.
/// </summary>
/// <param name="UsuarioId">Identificador do usuário (o do vínculo).</param>
/// <param name="NomeExibicao">Nome de exibição vindo do provedor, ou nulo.</param>
/// <param name="Perfil">Perfil do membro na empresa.</param>
/// <param name="EscopoObras">Escopo de obras: <c>todas</c>, <c>vinculadas</c> ou <c>carteiras</c>.</param>
/// <param name="RemovidoEm">Instante da remoção lógica (UTC), ou nulo se o membro está ativo.</param>
/// <param name="Versao">Versão da linha para a concorrência otimista (opaca: só se compara por igualdade): envie-a de volta ao alterar, remover ou reativar.</param>
public sealed record MembroResposta(Guid UsuarioId, string? NomeExibicao, string Perfil, string EscopoObras, DateTime? RemovidoEm, long Versao)
{
    #region Métodos públicos

    public static MembroResposta De(MembroListado membro)
    {
        ArgumentNullException.ThrowIfNull(membro);
        return new MembroResposta(membro.UsuarioId, membro.NomeExibicao, membro.Perfil, membro.EscopoObras, membro.RemovidoEm, membro.Versao);
    }

    public static MembroResposta De(MembroEmpresa membro, string? nomeExibicao)
    {
        ArgumentNullException.ThrowIfNull(membro);
        return new MembroResposta(membro.UsuarioId, nomeExibicao, membro.Perfil, membro.EscopoObras, membro.RemovidoEm, membro.Versao);
    }

    #endregion
}
