namespace CronoAI.Api.Desenvolvimento;

/// <summary>
/// Usuário de desenvolvimento (seção <c>Autenticacao:UsuarioDesenvolvimento</c>). Só existe com DOIS interruptores:
/// ambiente <c>Development</c> e <c>Habilitado=true</c>. A flag não fica em nenhum <c>appsettings*.json</c>
/// versionado: vem de user-secrets ou de variável de ambiente.
/// </summary>
public sealed class OpcoesUsuarioDesenvolvimento
{
    #region Campos

    public const string Secao = "Autenticacao:UsuarioDesenvolvimento";

    #endregion

    #region Propriedades

    public bool Habilitado { get; set; }

    #endregion
}
