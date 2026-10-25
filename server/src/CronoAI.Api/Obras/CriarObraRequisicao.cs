using System.Text.Json;

namespace CronoAI.Api.Obras;

/// <summary>
/// Corpo de <c>POST /api/v1/obras</c>. Não tem <c>empresaId</c>, <c>id</c>, <c>versao</c> nem datas de controle: a obra nasce na
/// empresa da sessão e o que vier a mais no JSON é ignorado (atribuição em massa).
/// </summary>
/// <param name="Nome">Nome da obra (1 a 200 caracteres; único entre as obras não arquivadas da empresa, sem diferenciar caixa).</param>
/// <param name="Uf">Sigla da UF da obra.</param>
/// <param name="MunicipioIbge">Código IBGE do município (7 dígitos, com dígito verificador).</param>
/// <param name="ResponsavelId">Membro da empresa responsável; nulo se não houver.</param>
/// <param name="DataStatus">Data de status do cronograma; pode ser nula.</param>
/// <param name="Sinapi">Parâmetros SINAPI; nulo se a obra não os tem.</param>
/// <param name="OpcoesCronograma">Objeto JSON opaco (até 16 KB e 16 níveis): o servidor guarda e devolve sem interpretar. Ausente vale <c>{}</c>.</param>
/// <param name="Motivo">Motivo opcional da mudança (até 500 caracteres) para a trilha de auditoria. Não digite dado pessoal.</param>
public sealed record CriarObraRequisicao(
    string? Nome,
    string? Uf,
    string? MunicipioIbge,
    Guid? ResponsavelId,
    DateOnly? DataStatus,
    SinapiObra? Sinapi,
    JsonElement? OpcoesCronograma,
    string? Motivo);
