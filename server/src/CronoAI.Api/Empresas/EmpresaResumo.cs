namespace CronoAI.Api.Empresas;

/// <summary>Empresa em respostas da API: só id e nome (sem CNPJ, minimização).</summary>
/// <param name="Id">Identificador da empresa.</param>
/// <param name="Nome">Nome da empresa.</param>
public sealed record EmpresaResumo(Guid Id, string Nome);
