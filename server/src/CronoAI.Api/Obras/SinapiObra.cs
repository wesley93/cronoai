namespace CronoAI.Api.Obras;

/// <summary>Parâmetros SINAPI da obra: UF, regime e data-base juntos, ou nenhum deles (tudo ou nada).</summary>
/// <param name="Uf">Sigla da UF da tabela SINAPI.</param>
/// <param name="Regime">Regime de encargos: <c>desonerado</c> ou <c>nao_desonerado</c>.</param>
/// <param name="DataBase">Data-base da tabela, sempre o dia 1 do mês.</param>
public sealed record SinapiObra(string? Uf, string? Regime, DateOnly? DataBase);
