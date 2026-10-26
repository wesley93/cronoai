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

        // Membro: perfil, escopo e remoção lógica. Nunca nome, e-mail, emissor nem sujeito.
        [typeof(MembroEmpresa)] =
        [
            new(nameof(MembroEmpresa.Perfil), "perfil"),
            new(nameof(MembroEmpresa.EscopoObras), "escopo_obras"),
            new(nameof(MembroEmpresa.RemovidoEm), "removido_em"),
        ],

        // Vínculos: só os ids (o "antes" do remover é o próprio vínculo).
        [typeof(AcessoObra)] =
        [
            new(nameof(AcessoObra.ObraId), "obra_id"),
            new(nameof(AcessoObra.UsuarioId), "usuario_id"),
        ],

        // ResponsavelTexto fica FORA de propósito: é nome de pessoa por desenho (Q2) e a trilha é append-only, então não
        // se apaga depois. A troca só desse campo gera linha "alterar" vazia: registra quem e quando, sem o valor.
        [typeof(Frente)] =
        [
            new(nameof(Frente.Nome), "nome"),
            new(nameof(Frente.ResponsavelId), "responsavel_id"),
            new(nameof(Frente.ArquivadaEm), "arquivada_em"),
        ],
        [typeof(AcessoFrente)] =
        [
            new(nameof(AcessoFrente.ObraId), "obra_id"),
            new(nameof(AcessoFrente.FrenteId), "frente_id"),
            new(nameof(AcessoFrente.UsuarioId), "usuario_id"),
        ],
        [typeof(Carteira)] =
        [
            new(nameof(Carteira.Nome), "nome"),
            new(nameof(Carteira.Tipo), "tipo"),
            new(nameof(Carteira.ArquivadaEm), "arquivada_em"),
        ],
        [typeof(CarteiraObra)] =
        [
            new(nameof(CarteiraObra.CarteiraId), "carteira_id"),
            new(nameof(CarteiraObra.ObraId), "obra_id"),
        ],
        [typeof(AcessoCarteira)] =
        [
            new(nameof(AcessoCarteira.CarteiraId), "carteira_id"),
            new(nameof(AcessoCarteira.UsuarioId), "usuario_id"),
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
