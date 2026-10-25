using System;
using CronoAI.Dados.Rls;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CronoAI.Dados.Migrations
{
    /// <inheritdoc />
    public partial class IdentidadeEmpresas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "empresa",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    nome = table.Column<string>(type: "text", nullable: false),
                    criada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_empresa", x => x.id);
                    table.CheckConstraint("ck_empresa_nome_tamanho", "char_length(nome) BETWEEN 1 AND 200");
                });

            migrationBuilder.CreateTable(
                name: "usuario",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    emissor = table.Column<string>(type: "text", nullable: false),
                    sujeito = table.Column<string>(type: "text", nullable: false),
                    nome_exibicao = table.Column<string>(type: "text", nullable: true),
                    criado_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ultimo_acesso_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    desativado_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_usuario", x => x.id);
                    table.CheckConstraint("ck_usuario_emissor_tamanho", "char_length(emissor) BETWEEN 1 AND 2048");
                    table.CheckConstraint("ck_usuario_nome_tamanho", "nome_exibicao IS NULL OR char_length(nome_exibicao) <= 200");
                    table.CheckConstraint("ck_usuario_sujeito_tamanho", "char_length(sujeito) BETWEEN 1 AND 255");
                });

            migrationBuilder.CreateTable(
                name: "membro_empresa",
                schema: "cronoai",
                columns: table => new
                {
                    empresa_id = table.Column<Guid>(type: "uuid", nullable: false),
                    usuario_id = table.Column<Guid>(type: "uuid", nullable: false),
                    criado_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_membro_empresa", x => new { x.empresa_id, x.usuario_id });
                    table.ForeignKey(
                        name: "fk_membro_empresa_empresa",
                        column: x => x.empresa_id,
                        principalSchema: "cronoai",
                        principalTable: "empresa",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_membro_empresa_usuario",
                        column: x => x.usuario_id,
                        principalSchema: "cronoai",
                        principalTable: "usuario",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "sessao",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    usuario_id = table.Column<Guid>(type: "uuid", nullable: false),
                    empresa_ativa_id = table.Column<Guid>(type: "uuid", nullable: true),
                    criada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expira_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    encerrada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sessao", x => x.id);
                    table.CheckConstraint("ck_sessao_encerrada_apos_criada", "encerrada_em IS NULL OR encerrada_em >= criada_em");
                    table.CheckConstraint("ck_sessao_expira_apos_criada", "expira_em > criada_em");
                    table.ForeignKey(
                        name: "fk_sessao_membro_empresa",
                        columns: x => new { x.empresa_ativa_id, x.usuario_id },
                        principalSchema: "cronoai",
                        principalTable: "membro_empresa",
                        principalColumns: new[] { "empresa_id", "usuario_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_sessao_usuario",
                        column: x => x.usuario_id,
                        principalSchema: "cronoai",
                        principalTable: "usuario",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_membro_empresa_usuario_id",
                schema: "cronoai",
                table: "membro_empresa",
                column: "usuario_id");

            migrationBuilder.CreateIndex(
                name: "ix_sessao_empresa_ativa_id_usuario_id",
                schema: "cronoai",
                table: "sessao",
                columns: new[] { "empresa_ativa_id", "usuario_id" });

            migrationBuilder.CreateIndex(
                name: "ix_sessao_usuario_id",
                schema: "cronoai",
                table: "sessao",
                column: "usuario_id");

            migrationBuilder.CreateIndex(
                name: "ux_usuario_emissor_sujeito",
                schema: "cronoai",
                table: "usuario",
                columns: new[] { "emissor", "sujeito" },
                unique: true);

            // Privilégios: o Inicial concede DML geral por padrão; revoga-se o que nenhum código do ciclo usa.
            migrationBuilder.Sql("REVOKE DELETE ON cronoai.usuario FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE UPDATE, DELETE ON cronoai.empresa FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE UPDATE, DELETE ON cronoai.membro_empresa FROM cronoai_app;");

            // RLS forçado (o dono também se sujeita) + políticas por comando, sempre TO cronoai_app.
            var u = MigrationBuilderRlsExtensoes.ExpressaoUsuario;
            var e = MigrationBuilderRlsExtensoes.ExpressaoEmpresa;

            migrationBuilder.HabilitarRlsForcado("empresa");
            migrationBuilder.PoliticaSelect(
                "empresa",
                "pol_empresa_select",
                $"id = {e} OR EXISTS (SELECT 1 FROM cronoai.membro_empresa m WHERE m.empresa_id = empresa.id AND m.usuario_id = {u})");
            migrationBuilder.PoliticaInsert("empresa", "pol_empresa_insert", $"id = {e}");

            migrationBuilder.HabilitarRlsForcado("membro_empresa");
            migrationBuilder.PoliticaSelect("membro_empresa", "pol_membro_empresa_select", $"usuario_id = {u} OR empresa_id = {e}");
            migrationBuilder.PoliticaInsert("membro_empresa", "pol_membro_empresa_insert", $"empresa_id = {e}");

            migrationBuilder.HabilitarRlsForcado("sessao");
            migrationBuilder.PoliticaSelect("sessao", "pol_sessao_select", $"usuario_id = {u}");
            migrationBuilder.PoliticaInsert("sessao", "pol_sessao_insert", $"usuario_id = {u}");
            migrationBuilder.PoliticaUpdate("sessao", "pol_sessao_update", $"usuario_id = {u}", $"usuario_id = {u}");
            migrationBuilder.PoliticaDelete("sessao", "pol_sessao_delete", $"usuario_id = {u}");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "sessao",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "membro_empresa",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "empresa",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "usuario",
                schema: "cronoai");
        }
    }
}
