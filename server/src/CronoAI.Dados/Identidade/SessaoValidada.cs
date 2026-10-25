namespace CronoAI.Dados.Identidade;

/// <summary>Resultado da validação de uma sessão por requisição: empresa ativa vigente, prazo absoluto e emissor do usuário.</summary>
public sealed record SessaoValidada(Guid? EmpresaAtivaId, DateTime ExpiraEm, string Emissor);
