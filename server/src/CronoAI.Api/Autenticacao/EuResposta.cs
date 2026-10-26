using CronoAI.Api.Empresas;

namespace CronoAI.Api.Autenticacao;

/// <summary>Quem sou eu: usuário da sessão, suas empresas, a empresa ativa (nula até escolher) e o perfil nela.</summary>
/// <param name="Id">Identificador do usuário.</param>
/// <param name="NomeExibicao">Nome de exibição vindo do provedor (pode ser nulo).</param>
/// <param name="Empresas">Empresas das quais o usuário é membro ATIVO.</param>
/// <param name="EmpresaAtivaId">Empresa ativa da sessão, ou nulo se ainda não escolhida.</param>
/// <param name="Perfil">Perfil do membro na empresa ativa; nulo sem empresa ativa. O front só esconde botões por ele: ocultar não substitui a checagem do servidor.</param>
/// <param name="EscopoObras">Escopo de obras (todas, vinculadas ou carteiras) na empresa ativa; nulo sem empresa ativa.</param>
public sealed record EuResposta(Guid Id, string? NomeExibicao, IReadOnlyList<EmpresaResumo> Empresas, Guid? EmpresaAtivaId, string? Perfil, string? EscopoObras);
