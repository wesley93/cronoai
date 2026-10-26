using Npgsql;

namespace CronoAI.Api.Obras;

/// <summary>
/// Traduz erro de domínio e violação do banco no campo do contrato. A violação é identificada pelo
/// <c>SqlState</c> e pelo NOME da constraint (<see cref="PostgresException.ConstraintName"/>), percorrendo a cadeia de
/// <c>InnerException</c>; nenhuma mensagem do PostgreSQL nem nome de constraint vai ao cliente. Constraint não mapeada
/// NÃO é traduzida: o chamador deixa a exceção subir (500 genérico).
/// </summary>
public static class MapeadorErrosObra
{
    #region Campos

    private const string IndiceNomeAtivo = "ux_obra_empresa_nome_ativa";

    // A trilha é gravada ANTES do UPDATE no mesmo lote: se a obra deixou de existir entre o carregamento e a gravação, quem
    // reclama é a FK da trilha (e não a contagem de linhas do UPDATE). É o mesmo caso da obra que sumiu: 404.
    private const string FkDaTrilhaParaObra = "fk_auditoria_obra";

    // Constraint do banco → (campo do contrato, mensagem fixa). A mesma mensagem para responsável alheio e inexistente.
    private static readonly Dictionary<string, (string Campo, string Mensagem)> _porConstraint = new(StringComparer.Ordinal)
    {
        ["fk_obra_uf"] = ("uf", "UF inexistente."),
        ["fk_obra_municipio_uf"] = ("municipioIbge", "O município não pertence à UF informada."),
        ["fk_obra_responsavel"] = ("responsavelId", "O responsável deve ser membro da empresa."),
        ["fk_obra_sinapi_uf"] = ("sinapi.uf", "UF do SINAPI inexistente."),
        ["ck_obra_nome_tamanho"] = ("nome", "O nome deve ter entre 1 e 200 caracteres."),
        ["ck_obra_municipio_formato"] = ("municipioIbge", "O código do município deve ter 7 dígitos."),
        ["ck_obra_sinapi_regime"] = ("sinapi.regime", "Regime do SINAPI inválido."),
        ["ck_obra_sinapi_data_base_dia_1"] = ("sinapi.dataBase", "A data-base do SINAPI é sempre o dia 1 do mês."),
        ["ck_obra_sinapi_tudo_ou_nada"] = ("sinapi", "Informe UF, regime e data-base do SINAPI juntos, ou nenhum deles."),
        ["ck_obra_opcoes_objeto"] = ("opcoesCronograma", "As opções do cronograma devem ser um objeto JSON."),
        ["ck_obra_opcoes_tamanho"] = ("opcoesCronograma", "As opções do cronograma excedem o tamanho máximo."),
        ["ck_auditoria_antes_tamanho"] = ("opcoesCronograma", "As opções do cronograma excedem o tamanho máximo."),
        ["ck_auditoria_depois_tamanho"] = ("opcoesCronograma", "As opções do cronograma excedem o tamanho máximo."),
        ["ck_auditoria_motivo_tamanho"] = ("motivo", "O motivo deve ter no máximo 500 caracteres."),
    };

    #endregion

    #region Métodos públicos

    /// <summary>Chave camelCase do <c>ValidationProblem</c> para o parâmetro que o domínio acusou (<c>sinapiUf</c> vira <c>sinapi.uf</c>).</summary>
    public static string CampoDoDominio(string? parametro) => parametro switch
    {
        "sinapiUf" => "sinapi.uf",
        "sinapiRegime" => "sinapi.regime",
        "sinapiDataBase" => "sinapi.dataBase",
        null or "" => "corpo",
        _ => parametro,
    };

    /// <summary>
    /// A falha é uma recusa de política de RLS ou de privilégio (<c>42501</c>) em algum ponto da cadeia? Com o RLS por obra
    /// (ciclo 00014), a obra que deixou de ser VISÍVEL entre o carregamento e a gravação (vínculo revogado) faz a política de
    /// INSERT da trilha recusar com 42501, sem nome de constraint nem de tabela (o PostgreSQL não os informa). Quem chama
    /// decide pelo estado: se a obra não é mais visível é 404; se continua visível, o erro é outro e sobe (500 genérico).
    /// </summary>
    public static bool EhRecusaDePolitica(Exception erro)
    {
        ArgumentNullException.ThrowIfNull(erro);
        for (var atual = erro; atual is not null; atual = atual.InnerException)
        {
            if (atual is PostgresException { SqlState: PostgresErrorCodes.InsufficientPrivilege })
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Classifica a falha do banco: <c>null</c> se não for uma violação conhecida (o chamador relança); senão o resultado
    /// (400 por campo, 404 de obra que sumiu no meio da escrita ou 409 de nome repetido).
    /// </summary>
    public static ResultadoEscritaObra? Classificar(Exception erro)
    {
        ArgumentNullException.ThrowIfNull(erro);
        for (var atual = erro; atual is not null; atual = atual.InnerException)
        {
            if (atual is not PostgresException { ConstraintName: { } constraint } postgres)
            {
                continue;
            }

            if (postgres.SqlState == PostgresErrorCodes.ForeignKeyViolation && constraint == FkDaTrilhaParaObra)
            {
                return ResultadoEscritaObra.NaoEncontrada();
            }

            if (postgres.SqlState == PostgresErrorCodes.UniqueViolation && constraint == IndiceNomeAtivo)
            {
                return ResultadoEscritaObra.Conflito(ResultadoEscritaObra.ObraNomeDuplicado, null);
            }

            if (postgres.SqlState is PostgresErrorCodes.ForeignKeyViolation or PostgresErrorCodes.CheckViolation
                && _porConstraint.TryGetValue(constraint, out var campo))
            {
                return ResultadoEscritaObra.Invalida(campo.Campo, campo.Mensagem);
            }
        }

        return null;
    }

    #endregion
}
