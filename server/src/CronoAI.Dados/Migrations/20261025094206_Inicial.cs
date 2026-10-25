using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CronoAI.Dados.Migrations
{
    /// <summary>
    /// Base de privilégios do papel da aplicação (ADR 00004). Sem tabela de domínio.
    /// Executada pelo <c>cronoai_migrador</c> (dono do schema): o <c>ALTER DEFAULT PRIVILEGES</c>
    /// vale para objetos criados por quem o executa. Falha de forma ruidosa se o papel
    /// <c>cronoai_app</c> não existir (o bootstrap local o cria).
    /// </summary>
    public partial class Inicial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("GRANT USAGE ON SCHEMA cronoai TO cronoai_app;");
            migrationBuilder.Sql(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA cronoai GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cronoai_app;");
            migrationBuilder.Sql(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA cronoai GRANT USAGE, SELECT ON SEQUENCES TO cronoai_app;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA cronoai REVOKE USAGE, SELECT ON SEQUENCES FROM cronoai_app;");
            migrationBuilder.Sql(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA cronoai REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE USAGE ON SCHEMA cronoai FROM cronoai_app;");
        }
    }
}
