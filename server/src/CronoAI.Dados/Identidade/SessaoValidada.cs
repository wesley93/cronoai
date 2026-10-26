namespace CronoAI.Dados.Identidade;

/// <summary>
/// Resultado da validação de uma sessão por requisição: empresa ativa vigente, emissor do usuário e, com empresa ativa, o PERFIL
/// e o ESCOPO de obras do membro ATIVO (vêm na mesma consulta que valida a sessão: continua uma consulta por requisição). O prazo
/// já é conferido na própria consulta.
/// </summary>
/// <param name="EmpresaAtivaId">Empresa ativa da sessão (nula até escolher).</param>
/// <param name="Emissor">Emissor do usuário (o de desenvolvimento só vale em Development).</param>
/// <param name="Perfil">Perfil do membro na empresa ativa; nulo sem empresa ativa.</param>
/// <param name="EscopoObras">Escopo de obras do membro na empresa ativa; nulo sem empresa ativa.</param>
public sealed record SessaoValidada(Guid? EmpresaAtivaId, string Emissor, string? Perfil = null, string? EscopoObras = null);
