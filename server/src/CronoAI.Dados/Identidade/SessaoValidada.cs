namespace CronoAI.Dados.Identidade;

/// <summary>Resultado da validação de uma sessão por requisição: empresa ativa vigente e prazo absoluto.</summary>
public sealed record SessaoValidada(Guid? EmpresaAtivaId, DateTime ExpiraEm);
