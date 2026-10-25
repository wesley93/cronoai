namespace CronoAI.Api.Borda;

/// <summary>
/// Configuração do anel de chaves do Data Protection (seção <c>DataProtection</c>). Em <c>Development</c> o
/// padrão é uma pasta fora do repositório; fora dele o caminho é obrigatório (a guarda do anel em produção é da
/// Infraestrutura).
/// </summary>
public sealed class OpcoesDataProtection
{
    #region Campos

    public const string Secao = "DataProtection";

    #endregion

    #region Propriedades

    /// <summary>Pasta do anel de chaves (fora do repositório e do contexto do Docker).</summary>
    public string? CaminhoAnel { get; set; }

    #endregion
}
