using System.Text.Json;
using CronoAI.Dominio;

namespace CronoAI.Api.Auditoria;

/// <summary>
/// Linha da trilha como a API a devolve. Leva o <c>usuarioId</c> (pseudônimo) e NUNCA o nome: o nome é dado pessoal e o
/// front o resolve pela lista de membros. Não há IP (ciclo 00013, Q6).
/// </summary>
/// <param name="Id">Identificador da linha (cresce, mas não é monotônico por commit e tem buracos).</param>
/// <param name="Em">Instante da escrita (UTC).</param>
/// <param name="ObraId">Obra a que a linha pertence, ou nulo.</param>
/// <param name="UsuarioId">Quem escreveu (pseudônimo).</param>
/// <param name="Entidade">Entidade alterada (ex.: <c>obra</c>).</param>
/// <param name="EntidadeId">Identificador da entidade alterada.</param>
/// <param name="Acao">Ação: <c>criar</c>, <c>alterar</c>, <c>arquivar</c> ou <c>restaurar</c>.</param>
/// <param name="Origem">Canal da escrita: <c>ui</c>, <c>importacao</c>, <c>whatsapp</c> ou <c>api</c>.</param>
/// <param name="VersaoDepois">Versão da entidade depois da escrita.</param>
/// <param name="Motivo">Motivo informado (texto livre; tratar como dado, nunca como HTML).</param>
/// <param name="Antes">Só os campos alterados, antes da escrita (nulo na criação).</param>
/// <param name="Depois">Os mesmos campos depois da escrita.</param>
/// <param name="CorrelacaoId">TraceId da requisição, para juntar aos logs.</param>
public sealed record RegistroAuditoriaResposta(
    long Id,
    DateTime Em,
    Guid? ObraId,
    Guid UsuarioId,
    string Entidade,
    Guid EntidadeId,
    string Acao,
    string Origem,
    long? VersaoDepois,
    string? Motivo,
    JsonElement? Antes,
    JsonElement? Depois,
    Guid? CorrelacaoId)
{
    #region Métodos públicos

    public static RegistroAuditoriaResposta De(RegistroAuditoria registro)
    {
        ArgumentNullException.ThrowIfNull(registro);
        return new RegistroAuditoriaResposta(
            registro.Id,
            registro.Em,
            registro.ObraId,
            registro.UsuarioId,
            registro.Entidade,
            registro.EntidadeId,
            registro.Acao,
            registro.Origem,
            registro.VersaoDepois,
            registro.Motivo,
            Objeto(registro.Antes),
            Objeto(registro.Depois),
            registro.CorrelacaoId);
    }

    #endregion

    #region Métodos privados

    private static JsonElement? Objeto(string? json)
    {
        if (json is null)
        {
            return null;
        }

        using var documento = JsonDocument.Parse(json);
        return documento.RootElement.Clone();
    }

    #endregion
}
