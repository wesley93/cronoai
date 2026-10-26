using Npgsql;

namespace CronoAI.Api.Membros;

/// <summary>
/// Traduz a violação do banco no desfecho do contrato (membros e acessos de obra). A violação é identificada pelo
/// <c>SqlState</c> e pelo NOME da constraint (<see cref="PostgresException.ConstraintName"/>), percorrendo a cadeia de
/// <c>InnerException</c>; nenhuma mensagem do PostgreSQL nem nome de constraint vai ao cliente. Constraint não mapeada NÃO é
/// traduzida: o chamador deixa a exceção subir (500 genérico). Sem <c>catch</c> amplo.
/// </summary>
public static class MapeadorErrosMembros
{
    #region Campos

    private const string UltimoAdministradorConstraint = "ck_empresa_tem_administrador";

    private const string AcessoDuplicadoConstraint = "ux_acesso_obra_obra_usuario";

    private const string MembroDoAcessoConstraint = "fk_acesso_obra_membro";

    #endregion

    #region Métodos públicos

    /// <summary>Desfecho de uma violação conhecida, ou <c>null</c> se o erro não é conhecido.</summary>
    public static DesfechoDeBanco? Classificar(Exception erro)
    {
        ArgumentNullException.ThrowIfNull(erro);
        for (var atual = erro; atual is not null; atual = atual.InnerException)
        {
            if (atual is not PostgresException { ConstraintName: { } constraint } postgres)
            {
                continue;
            }

            // O gatilho diferido do último administrador chega no COMMIT como check_violation com o nome da constraint.
            if (postgres.SqlState == PostgresErrorCodes.CheckViolation && constraint == UltimoAdministradorConstraint)
            {
                return DesfechoDeBanco.UltimoAdministrador;
            }

            if (postgres.SqlState == PostgresErrorCodes.UniqueViolation && constraint == AcessoDuplicadoConstraint)
            {
                return DesfechoDeBanco.AcessoExistente;
            }

            if (postgres.SqlState == PostgresErrorCodes.ForeignKeyViolation && constraint == MembroDoAcessoConstraint)
            {
                return DesfechoDeBanco.DestinoInvalido;
            }
        }

        return null;
    }

    #endregion
}
