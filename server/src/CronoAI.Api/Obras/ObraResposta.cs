using System.Text.Json;
using CronoAI.Dominio;

namespace CronoAI.Api.Obras;

/// <summary>Obra como a API a devolve (também é o <c>estadoAtual</c> dos 409).</summary>
/// <param name="Id">Identificador da obra.</param>
/// <param name="Nome">Nome da obra.</param>
/// <param name="Uf">Sigla da UF da obra.</param>
/// <param name="MunicipioIbge">Código IBGE do município.</param>
/// <param name="ResponsavelId">Membro responsável, ou nulo.</param>
/// <param name="DataStatus">Data de status do cronograma, ou nula.</param>
/// <param name="Sinapi">Parâmetros SINAPI, ou nulo.</param>
/// <param name="OpcoesCronograma">Objeto JSON opaco, devolvido como foi guardado (o cliente o trata como dado, nunca como HTML).</param>
/// <param name="Versao">Versão para a concorrência otimista: envie-a de volta em <c>PUT</c>, <c>arquivar</c> e <c>restaurar</c>.</param>
/// <param name="CriadaEm">Instante de criação (UTC).</param>
/// <param name="AtualizadaEm">Instante da última mudança (UTC).</param>
/// <param name="ArquivadaEm">Instante do arquivamento (UTC), ou nulo se a obra está ativa.</param>
public sealed record ObraResposta(
    Guid Id,
    string Nome,
    string Uf,
    string MunicipioIbge,
    Guid? ResponsavelId,
    DateOnly? DataStatus,
    SinapiObra? Sinapi,
    JsonElement OpcoesCronograma,
    long Versao,
    DateTime CriadaEm,
    DateTime AtualizadaEm,
    DateTime? ArquivadaEm)
{
    #region Métodos públicos

    public static ObraResposta De(Obra obra)
    {
        ArgumentNullException.ThrowIfNull(obra);

        // Tudo ou nada no banco: basta olhar um dos três campos.
        var sinapi = obra.SinapiUf is null ? null : new SinapiObra(obra.SinapiUf, obra.SinapiRegime, obra.SinapiDataBase);
        using var opcoes = JsonDocument.Parse(obra.OpcoesCronograma);
        return new ObraResposta(
            obra.Id,
            obra.Nome,
            obra.Uf,
            obra.MunicipioIbge,
            obra.ResponsavelId,
            obra.DataStatus,
            sinapi,
            opcoes.RootElement.Clone(),
            obra.Versao,
            obra.CriadaEm,
            obra.AtualizadaEm,
            obra.ArquivadaEm);
    }

    #endregion
}
