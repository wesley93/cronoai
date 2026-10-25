using CronoAI.Dominio;

namespace CronoAI.Dados.Auditoria;

/// <summary>
/// Lista branca de campos por entidade auditável (minimização: só o que está aqui entra na trilha; o resto é
/// descartado). Toda <see cref="IAuditavel"/> do modelo precisa de uma entrada (teste de arquitetura). Nunca entram
/// nome, e-mail, emissor, sujeito nem IP. <c>versao</c> não está aqui: vai para a coluna <c>versao_depois</c>.
/// </summary>
public static class ListaBrancaAuditoria
{
    #region Campos

    private static readonly IReadOnlyDictionary<Type, IReadOnlyList<CampoAuditado>> _porTipo = new Dictionary<Type, IReadOnlyList<CampoAuditado>>
    {
        [typeof(Obra)] =
        [
            new(nameof(Obra.Nome), "nome"),
            new(nameof(Obra.Uf), "uf"),
            new(nameof(Obra.MunicipioIbge), "municipio_ibge"),
            new(nameof(Obra.ResponsavelId), "responsavel_id"),
            new(nameof(Obra.DataStatus), "data_status"),
            new(nameof(Obra.SinapiUf), "sinapi_uf"),
            new(nameof(Obra.SinapiRegime), "sinapi_regime"),
            new(nameof(Obra.SinapiDataBase), "sinapi_data_base"),
            new(nameof(Obra.OpcoesCronograma), "opcoes_cronograma", EhJson: true),
            new(nameof(Obra.ArquivadaEm), "arquivada_em"),
        ],
    };

    #endregion

    #region Propriedades

    /// <summary>Tipos auditáveis cobertos pela lista.</summary>
    public static IReadOnlyCollection<Type> Tipos => _porTipo.Keys.ToList();

    #endregion

    #region Métodos públicos

    public static bool Contem(Type tipo) => _porTipo.ContainsKey(tipo);

    /// <summary>Campos do tipo; lança se o tipo auditável não tem lista (falha fechada).</summary>
    public static IReadOnlyList<CampoAuditado> Campos(Type tipo)
    {
        return _porTipo.TryGetValue(tipo, out var campos)
            ? campos
            : throw new InvalidOperationException($"A entidade auditável {tipo.Name} não tem lista branca de campos.");
    }

    #endregion
}
