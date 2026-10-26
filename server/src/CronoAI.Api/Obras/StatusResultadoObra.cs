namespace CronoAI.Api.Obras;

/// <summary>Desfecho de uma escrita de obra no <see cref="ServicoObras"/>.</summary>
public enum StatusResultadoObra
{
    /// <summary>Escrita feita (ou, no <c>PUT</c> sem mudança, nada a fazer): 200 ou 201.</summary>
    Ok,

    /// <summary>Entrada inválida no domínio ou no banco: 400 com o campo.</summary>
    Invalida,

    /// <summary>Obra inexistente OU de outra empresa (indistinguíveis de propósito): 404.</summary>
    NaoEncontrada,

    /// <summary>Conflito com o estado atual (versão velha, obra arquivada, nome repetido): 409.</summary>
    Conflito,

    /// <summary>O perfil pode editar a obra mas não os campos de cadastro que o corpo muda (nome, UF, município, responsável, SINAPI): 403.</summary>
    CampoNaoPermitido,
}
