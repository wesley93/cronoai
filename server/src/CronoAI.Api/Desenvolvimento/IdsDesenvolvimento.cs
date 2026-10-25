namespace CronoAI.Api.Desenvolvimento;

/// <summary>Ids e nomes FICTÍCIOS e fixos da semente de desenvolvimento (idempotência sem ler sob RLS).</summary>
public static class IdsDesenvolvimento
{
    #region Campos

    public static readonly Guid EmpresaA = new("0195f000-0000-7000-8000-0000000000a1");

    public static readonly Guid EmpresaB = new("0195f000-0000-7000-8000-0000000000b2");

    public static readonly Guid EmpresaCompartilhada = new("0195f000-0000-7000-8000-0000000000c3");

    public const string NomeEmpresaA = "Construtora Fictícia A";

    public const string NomeEmpresaB = "Construtora Fictícia B";

    public const string NomeEmpresaCompartilhada = "Construtora Fictícia Compartilhada";

    public const string SujeitoDevA = "dev-a";

    public const string SujeitoDevB = "dev-b";

    public const string NomeDevA = "Dev A (fictício)";

    public const string NomeDevB = "Dev B (fictício)";

    #endregion
}
