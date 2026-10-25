namespace CronoAI.Dados.Identidade;

/// <summary>Resultado da validação de uma sessão por requisição: empresa ativa vigente e emissor do usuário. O prazo já é conferido na própria consulta.</summary>
public sealed record SessaoValidada(Guid? EmpresaAtivaId, string Emissor);
