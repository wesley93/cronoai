namespace CronoAI.Api.Empresas;

/// <summary>Corpo de <c>PUT /api/v1/empresas/atual</c>: a empresa escolhida entre as do usuário.</summary>
/// <param name="EmpresaId">Empresa a tornar ativa na sessão.</param>
public sealed record TrocarEmpresaAtivaRequisicao(Guid EmpresaId);
