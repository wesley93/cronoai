namespace CronoAI.Api.Membros;

/// <summary>Desfecho de uma escrita de membro no <see cref="ServicoMembros"/>.</summary>
public enum StatusResultadoMembro
{
    /// <summary>Escrita feita (ou, na troca sem mudança, nada a fazer): 200.</summary>
    Ok,

    /// <summary>Entrada inválida no domínio ou no banco: 400 com o campo.</summary>
    Invalida,

    /// <summary>O perfil existe mas ainda não pode ser atribuído por esta API (encarregado): 400 <c>perfil-indisponivel</c>.</summary>
    PerfilIndisponivel,

    /// <summary>Membro inexistente OU de outra empresa (indistinguíveis de propósito): 404.</summary>
    NaoEncontrado,

    /// <summary>Conflito com o estado atual (versão velha, último administrador, membro responsável, removido, não removido): 409.</summary>
    Conflito,
}
