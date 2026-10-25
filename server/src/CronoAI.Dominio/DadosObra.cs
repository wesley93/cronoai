namespace CronoAI.Dominio;

/// <summary>
/// Campos editáveis da obra (criar e substituir pelo <c>PUT</c>). Os nomes dos parâmetros são os das chaves do
/// contrato da API em camelCase: a validação do domínio devolve o nome do campo em <see cref="ArgumentException.ParamName"/>.
/// </summary>
/// <param name="Nome">Nome da obra (aparado nas pontas pelo domínio).</param>
/// <param name="Uf">Sigla da UF da obra.</param>
/// <param name="MunicipioIbge">Código IBGE do município (7 dígitos, com dígito verificador).</param>
/// <param name="ResponsavelId">Membro da empresa responsável; nulo se não houver.</param>
/// <param name="DataStatus">Data de status do cronograma; nula permitida (Q8).</param>
/// <param name="SinapiUf">UF da tabela SINAPI (tudo ou nada com regime e data-base).</param>
/// <param name="SinapiRegime">Regime de encargos (<see cref="RegimesSinapi"/>).</param>
/// <param name="SinapiDataBase">Data-base do SINAPI, sempre no dia 1.</param>
/// <param name="OpcoesCronograma">Objeto JSON opaco: o servidor guarda e devolve, sem interpretar (ciclo 00013).</param>
public sealed record DadosObra(
    string Nome,
    string Uf,
    string MunicipioIbge,
    Guid? ResponsavelId,
    DateOnly? DataStatus,
    string? SinapiUf,
    string? SinapiRegime,
    DateOnly? SinapiDataBase,
    string OpcoesCronograma = "{}");
