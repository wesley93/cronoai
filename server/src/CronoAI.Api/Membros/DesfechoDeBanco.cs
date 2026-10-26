namespace CronoAI.Api.Membros;

/// <summary>Violação do banco que o contrato sabe traduzir (ver <see cref="MapeadorErrosMembros"/>).</summary>
public enum DesfechoDeBanco
{
    /// <summary>A empresa ficaria sem administrador ativo: 409 <c>ultimo-administrador</c>.</summary>
    UltimoAdministrador,

    /// <summary>O vínculo membro × obra já existe: 409 <c>acesso-existente</c>.</summary>
    AcessoExistente,

    /// <summary>O membro destino não existe na empresa da obra: 400 na chave <c>usuarioId</c>.</summary>
    DestinoInvalido,
}
