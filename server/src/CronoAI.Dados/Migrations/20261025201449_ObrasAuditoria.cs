using System;
using CronoAI.Dados.Rls;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace CronoAI.Dados.Migrations
{
    /// <inheritdoc />
    public partial class ObrasAuditoria : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "uf_referencia",
                schema: "cronoai",
                columns: table => new
                {
                    sigla = table.Column<string>(type: "text", nullable: false),
                    codigo_ibge = table.Column<short>(type: "smallint", nullable: false),
                    nome = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_uf_referencia", x => x.sigla);
                    table.UniqueConstraint("ux_uf_referencia_sigla_codigo", x => new { x.sigla, x.codigo_ibge });
                    table.CheckConstraint("ck_uf_referencia_sigla", "sigla ~ '^[A-Z]{2}$'");
                });

            // Semente das 27 UFs (ciclo 00013, Q3): EXCEÇÃO registrada ao ADR 00004 ("seed só por comando"), porque aqui é
            // dado nacional imutável necessário à integridade (FK da obra), não dado de desenvolvimento. Tabela SEM RLS,
            // por isso InsertData (e não o helper ExecutarDmlComRls). CONFERIR os códigos contra a fonte oficial do IBGE
            // antes do merge: pendência do usuário (V-1 do plano 00013).
            migrationBuilder.InsertData(
                table: "uf_referencia",
                schema: "cronoai",
                columns: new[] { "sigla", "codigo_ibge", "nome" },
                values: new object[,]
                {
                    { "RO", (short)11, "Rondônia" },
                    { "AC", (short)12, "Acre" },
                    { "AM", (short)13, "Amazonas" },
                    { "RR", (short)14, "Roraima" },
                    { "PA", (short)15, "Pará" },
                    { "AP", (short)16, "Amapá" },
                    { "TO", (short)17, "Tocantins" },
                    { "MA", (short)21, "Maranhão" },
                    { "PI", (short)22, "Piauí" },
                    { "CE", (short)23, "Ceará" },
                    { "RN", (short)24, "Rio Grande do Norte" },
                    { "PB", (short)25, "Paraíba" },
                    { "PE", (short)26, "Pernambuco" },
                    { "AL", (short)27, "Alagoas" },
                    { "SE", (short)28, "Sergipe" },
                    { "BA", (short)29, "Bahia" },
                    { "MG", (short)31, "Minas Gerais" },
                    { "ES", (short)32, "Espírito Santo" },
                    { "RJ", (short)33, "Rio de Janeiro" },
                    { "SP", (short)35, "São Paulo" },
                    { "PR", (short)41, "Paraná" },
                    { "SC", (short)42, "Santa Catarina" },
                    { "RS", (short)43, "Rio Grande do Sul" },
                    { "MS", (short)50, "Mato Grosso do Sul" },
                    { "MT", (short)51, "Mato Grosso" },
                    { "GO", (short)52, "Goiás" },
                    { "DF", (short)53, "Distrito Federal" },
                });

            migrationBuilder.CreateTable(
                name: "municipio_referencia",
                schema: "cronoai",
                columns: table => new
                {
                    codigo_ibge = table.Column<string>(type: "text", nullable: false),
                    uf = table.Column<string>(type: "text", nullable: false),
                    nome = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_municipio_referencia", x => x.codigo_ibge);
                    table.UniqueConstraint("ux_municipio_referencia_codigo_uf", x => new { x.codigo_ibge, x.uf });
                    table.CheckConstraint("ck_municipio_referencia_codigo", "codigo_ibge ~ '^[0-9]{7}$'");
                    table.ForeignKey(
                        name: "fk_municipio_referencia_uf",
                        column: x => x.uf,
                        principalSchema: "cronoai",
                        principalTable: "uf_referencia",
                        principalColumn: "sigla",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "obra",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    empresa_id = table.Column<Guid>(type: "uuid", nullable: false),
                    nome = table.Column<string>(type: "text", nullable: false),
                    uf = table.Column<string>(type: "text", nullable: false),
                    municipio_ibge = table.Column<string>(type: "text", nullable: false),
                    responsavel_id = table.Column<Guid>(type: "uuid", nullable: true),
                    data_status = table.Column<DateOnly>(type: "date", nullable: true),
                    sinapi_uf = table.Column<string>(type: "text", nullable: true),
                    sinapi_regime = table.Column<string>(type: "text", nullable: true),
                    sinapi_data_base = table.Column<DateOnly>(type: "date", nullable: true),
                    opcoes_cronograma = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'{}'::jsonb"),
                    versao = table.Column<long>(type: "bigint", rowVersion: true, nullable: false, defaultValue: 1L),
                    criada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    atualizada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    arquivada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    municipio_uf_cod = table.Column<short>(type: "smallint", nullable: true, computedColumnSql: "CASE WHEN municipio_ibge ~ '^[0-9]{7}$' THEN substr(municipio_ibge, 1, 2)::smallint END", stored: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_obra", x => x.id);
                    table.UniqueConstraint("ux_obra_empresa_id_id", x => new { x.empresa_id, x.id });
                    table.CheckConstraint("ck_obra_arquivada_apos_criada", "arquivada_em IS NULL OR arquivada_em >= criada_em");
                    table.CheckConstraint("ck_obra_atualizada_apos_criada", "atualizada_em >= criada_em");
                    table.CheckConstraint("ck_obra_municipio_formato", "municipio_ibge ~ '^[0-9]{7}$'");
                    table.CheckConstraint("ck_obra_nome_tamanho", "char_length(nome) BETWEEN 1 AND 200");
                    table.CheckConstraint("ck_obra_opcoes_objeto", "jsonb_typeof(opcoes_cronograma) = 'object'");
                    table.CheckConstraint("ck_obra_opcoes_tamanho", "octet_length(opcoes_cronograma::text) <= 16384");
                    table.CheckConstraint("ck_obra_sinapi_data_base_dia_1", "sinapi_data_base IS NULL OR EXTRACT(DAY FROM sinapi_data_base) = 1");
                    table.CheckConstraint("ck_obra_sinapi_regime", "sinapi_regime IS NULL OR sinapi_regime IN ('desonerado', 'nao_desonerado')");
                    table.CheckConstraint("ck_obra_sinapi_tudo_ou_nada", "(sinapi_uf IS NULL) = (sinapi_regime IS NULL) AND (sinapi_uf IS NULL) = (sinapi_data_base IS NULL)");
                    table.CheckConstraint("ck_obra_versao_positiva", "versao >= 1");
                    table.ForeignKey(
                        name: "fk_obra_empresa",
                        column: x => x.empresa_id,
                        principalSchema: "cronoai",
                        principalTable: "empresa",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_obra_municipio_uf",
                        columns: x => new { x.uf, x.municipio_uf_cod },
                        principalSchema: "cronoai",
                        principalTable: "uf_referencia",
                        principalColumns: new[] { "sigla", "codigo_ibge" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_obra_responsavel",
                        columns: x => new { x.empresa_id, x.responsavel_id },
                        principalSchema: "cronoai",
                        principalTable: "membro_empresa",
                        principalColumns: new[] { "empresa_id", "usuario_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_obra_sinapi_uf",
                        column: x => x.sinapi_uf,
                        principalSchema: "cronoai",
                        principalTable: "uf_referencia",
                        principalColumn: "sigla",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_obra_uf",
                        column: x => x.uf,
                        principalSchema: "cronoai",
                        principalTable: "uf_referencia",
                        principalColumn: "sigla",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auditoria",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    empresa_id = table.Column<Guid>(type: "uuid", nullable: false),
                    obra_id = table.Column<Guid>(type: "uuid", nullable: true),
                    usuario_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entidade = table.Column<string>(type: "text", nullable: false),
                    entidade_id = table.Column<Guid>(type: "uuid", nullable: false),
                    acao = table.Column<string>(type: "text", nullable: false),
                    antes = table.Column<string>(type: "jsonb", nullable: true),
                    depois = table.Column<string>(type: "jsonb", nullable: true),
                    versao_depois = table.Column<long>(type: "bigint", nullable: true),
                    origem = table.Column<string>(type: "text", nullable: false),
                    motivo = table.Column<string>(type: "text", nullable: true),
                    correlacao_id = table.Column<Guid>(type: "uuid", nullable: true),
                    em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_auditoria", x => x.id);
                    table.CheckConstraint("ck_auditoria_acao", "acao IN ('criar', 'alterar', 'arquivar', 'restaurar')");
                    table.CheckConstraint("ck_auditoria_antes_objeto", "antes IS NULL OR jsonb_typeof(antes) = 'object'");
                    table.CheckConstraint("ck_auditoria_antes_tamanho", "antes IS NULL OR octet_length(antes::text) <= 262144");
                    table.CheckConstraint("ck_auditoria_depois_objeto", "depois IS NULL OR jsonb_typeof(depois) = 'object'");
                    table.CheckConstraint("ck_auditoria_depois_tamanho", "depois IS NULL OR octet_length(depois::text) <= 262144");
                    table.CheckConstraint("ck_auditoria_entidade", "entidade ~ '^[a-z_]{1,64}$'");
                    table.CheckConstraint("ck_auditoria_motivo_tamanho", "motivo IS NULL OR char_length(motivo) <= 500");
                    table.CheckConstraint("ck_auditoria_origem", "origem IN ('ui', 'importacao', 'whatsapp', 'api')");
                    table.ForeignKey(
                        name: "fk_auditoria_empresa",
                        column: x => x.empresa_id,
                        principalSchema: "cronoai",
                        principalTable: "empresa",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auditoria_obra",
                        columns: x => new { x.empresa_id, x.obra_id },
                        principalSchema: "cronoai",
                        principalTable: "obra",
                        principalColumns: new[] { "empresa_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_auditoria_usuario",
                        column: x => x.usuario_id,
                        principalSchema: "cronoai",
                        principalTable: "usuario",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_auditoria_empresa_em",
                schema: "cronoai",
                table: "auditoria",
                columns: new[] { "empresa_id", "em", "id" },
                descending: new[] { false, true, true });

            migrationBuilder.CreateIndex(
                name: "ix_auditoria_empresa_id",
                schema: "cronoai",
                table: "auditoria",
                columns: new[] { "empresa_id", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_auditoria_empresa_obra_em",
                schema: "cronoai",
                table: "auditoria",
                columns: new[] { "empresa_id", "obra_id", "em", "id" },
                descending: new[] { false, false, true, true });

            migrationBuilder.CreateIndex(
                name: "ix_auditoria_usuario_id",
                schema: "cronoai",
                table: "auditoria",
                column: "usuario_id");

            migrationBuilder.CreateIndex(
                name: "ix_municipio_referencia_uf",
                schema: "cronoai",
                table: "municipio_referencia",
                column: "uf");

            migrationBuilder.CreateIndex(
                name: "ix_obra_empresa_id_responsavel_id",
                schema: "cronoai",
                table: "obra",
                columns: new[] { "empresa_id", "responsavel_id" });

            migrationBuilder.CreateIndex(
                name: "ix_obra_sinapi_uf",
                schema: "cronoai",
                table: "obra",
                column: "sinapi_uf");

            migrationBuilder.CreateIndex(
                name: "ix_obra_uf_municipio_uf_cod",
                schema: "cronoai",
                table: "obra",
                columns: new[] { "uf", "municipio_uf_cod" });

            migrationBuilder.CreateIndex(
                name: "ux_uf_referencia_codigo",
                schema: "cronoai",
                table: "uf_referencia",
                column: "codigo_ibge",
                unique: true);

            // Nome único por empresa entre as obras NÃO arquivadas, sem diferenciar caixa (ciclo 00013, Q5: opinião de
            // produto). Índice parcial e por expressão: o EF não o expressa, então ele vive só aqui e só o teste de banco o
            // protege (o has-pending-model-changes não o vigia). Arquivar libera o nome.
            migrationBuilder.Sql(
                "CREATE UNIQUE INDEX ux_obra_empresa_nome_ativa ON cronoai.obra (empresa_id, lower(nome)) WHERE arquivada_em IS NULL;");

            // Concorrência otimista (Q2): o gatilho soma 1 em TODO update e ignora o valor enviado, inclusive por caminho
            // que fuja do EF. search_path fixo: a função não depende do caminho de busca de quem a dispara.
            migrationBuilder.Sql(
                """
                CREATE FUNCTION cronoai.obra_incrementa_versao() RETURNS trigger
                LANGUAGE plpgsql
                SET search_path = pg_catalog
                AS $$
                BEGIN
                  NEW.versao := OLD.versao + 1;
                  RETURN NEW;
                END
                $$;
                """);
            migrationBuilder.Sql(
                "CREATE TRIGGER trg_obra_versao BEFORE UPDATE ON cronoai.obra FOR EACH ROW EXECUTE FUNCTION cronoai.obra_incrementa_versao();");

            // Privilégios: o Inicial concede DML geral por padrão; revoga-se o que nenhum código usa.
            // Listas globais: só leitura. Obra: sem DELETE (o "D" do CRUD é arquivar). Trilha: só SELECT e INSERT;
            // TRUNCATE é revogado explicitamente mesmo sem constar do padrão (camada 1 do append-only).
            migrationBuilder.Sql("REVOKE INSERT, UPDATE, DELETE ON cronoai.uf_referencia FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE INSERT, UPDATE, DELETE ON cronoai.municipio_referencia FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE DELETE ON cronoai.obra FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE UPDATE, DELETE, TRUNCATE ON cronoai.auditoria FROM cronoai_app;");

            // Camada 3 do append-only: gatilho de INSTRUÇÃO (dispara com 0 linhas, para o dono e para TRUNCATE, que gatilho
            // por linha não cobre). ENABLE ALWAYS: continua valendo com session_replication_role = replica. Limite: o dono
            // ainda pode fazer DDL (DROP/DISABLE TRIGGER) e o superusuário contorna tudo (ADR 00009).
            migrationBuilder.Sql(
                """
                CREATE FUNCTION cronoai.auditoria_recusa_alteracao() RETURNS trigger
                LANGUAGE plpgsql
                SET search_path = pg_catalog
                AS $$
                BEGIN
                  RAISE EXCEPTION 'auditoria é append-only' USING ERRCODE = 'restrict_violation';
                END
                $$;
                """);
            migrationBuilder.Sql(
                "CREATE TRIGGER trg_auditoria_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON cronoai.auditoria FOR EACH STATEMENT EXECUTE FUNCTION cronoai.auditoria_recusa_alteracao();");
            migrationBuilder.Sql("ALTER TABLE cronoai.auditoria ENABLE ALWAYS TRIGGER trg_auditoria_append_only;");

            // RLS forçado (o dono também se sujeita) + políticas por comando, sempre TO cronoai_app. A trilha só tem
            // SELECT e INSERT (camada 2 do append-only): sem política de UPDATE/DELETE, o RLS esconde as linhas.
            var e = MigrationBuilderRlsExtensoes.ExpressaoEmpresa;

            migrationBuilder.HabilitarRlsForcado("obra");
            migrationBuilder.PoliticaSelect("obra", "pol_obra_select", $"empresa_id = {e}");
            migrationBuilder.PoliticaInsert("obra", "pol_obra_insert", $"empresa_id = {e}");
            migrationBuilder.PoliticaUpdate("obra", "pol_obra_update", $"empresa_id = {e}", $"empresa_id = {e}");

            migrationBuilder.HabilitarRlsForcado("auditoria");
            migrationBuilder.PoliticaSelect("auditoria", "pol_auditoria_select", $"empresa_id = {e}");
            migrationBuilder.PoliticaInsert("auditoria", "pol_auditoria_insert", $"empresa_id = {e}");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "auditoria",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "municipio_referencia",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "obra",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "uf_referencia",
                schema: "cronoai");

            // As tabelas levam os gatilhos e o índice parcial; as funções são objetos à parte.
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS cronoai.auditoria_recusa_alteracao();");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS cronoai.obra_incrementa_versao();");
        }
    }
}
