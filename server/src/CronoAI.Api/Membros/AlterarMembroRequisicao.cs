namespace CronoAI.Api.Membros;

/// <summary>
/// Corpo de <c>PUT /api/v1/membros/{usuarioId}</c>: troca o perfil (e o escopo) do membro. Nunca leva empresa nem usuário: a
/// empresa é a da sessão e o membro é o da URL.
/// </summary>
/// <param name="Perfil">Novo perfil. <c>encarregado</c> ainda não está disponível (400 <c>perfil-indisponivel</c>).</param>
/// <param name="EscopoObras">Escopo de obras. Os perfis com um único escopo válido recebem o do servidor; <c>gestor_portfolio</c> e <c>diretoria</c> exigem <c>todas</c> ou <c>carteiras</c>.</param>
/// <param name="Versao">Versão do membro que o cliente leu (obrigatória): versão velha recebe 409 com o estado atual.</param>
/// <param name="Motivo">Motivo opcional (até 500 caracteres) para a trilha de auditoria. Não digite dado pessoal.</param>
public sealed record AlterarMembroRequisicao(string? Perfil, string? EscopoObras, long? Versao, string? Motivo);
