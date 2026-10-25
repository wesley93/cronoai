using CronoAI.Api.Empresas;

namespace CronoAI.Api.Autenticacao;

/// <summary>Quem sou eu: usuário da sessão, suas empresas e a empresa ativa (nula até escolher).</summary>
/// <param name="Id">Identificador do usuário.</param>
/// <param name="NomeExibicao">Nome de exibição vindo do provedor (pode ser nulo).</param>
/// <param name="Empresas">Empresas das quais o usuário é membro.</param>
/// <param name="EmpresaAtivaId">Empresa ativa da sessão, ou nulo se ainda não escolhida.</param>
public sealed record EuResposta(Guid Id, string? NomeExibicao, IReadOnlyList<EmpresaResumo> Empresas, Guid? EmpresaAtivaId);
