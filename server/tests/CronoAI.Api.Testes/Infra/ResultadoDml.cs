namespace CronoAI.Api.Testes.Infra;

/// <summary>Resultado de um DML rodado pelo <see cref="ScriptRls"/>: linhas afetadas ou o SQLSTATE do erro.</summary>
public sealed record ResultadoDml(long? Afetadas, string? SqlState, string Erro);
