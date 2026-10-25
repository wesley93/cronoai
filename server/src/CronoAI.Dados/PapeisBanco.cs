namespace CronoAI.Dados;

/// <summary>
/// Nomes dos papéis e do schema do PostgreSQL (ADR 00004). São criados pelo bootstrap local
/// (<c>server/db/bootstrap/01-papeis-e-schema.sh</c>); uma migração que os cita falha de forma
/// ruidosa em ambiente sem eles, o que é desejável.
/// </summary>
public static class PapeisBanco
{
    #region Campos

    /// <summary>Schema único da aplicação; dono: <see cref="Migrador"/>.</summary>
    public const string Schema = "cronoai";

    /// <summary>Dono do schema: roda as migrações (DDL). Nunca é usado pela API.</summary>
    public const string Migrador = "cronoai_migrador";

    /// <summary>Papel da API e dos testes de API: só DML, sem DDL, sem superusuário, sem BYPASSRLS.</summary>
    public const string Aplicacao = "cronoai_app";

    /// <summary>Nome fixo da tabela de histórico de migrações, no schema <see cref="Schema"/>.</summary>
    public const string HistoricoMigracoes = "__ef_migrations_history";

    #endregion
}
