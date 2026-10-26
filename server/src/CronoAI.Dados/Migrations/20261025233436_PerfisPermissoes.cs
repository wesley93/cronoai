using System;
using CronoAI.Dados.Rls;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CronoAI.Dados.Migrations
{
    /// <summary>
    /// Ciclo 00014: perfil e escopo de obras no membro, RLS por obra, vínculos, frentes e carteiras, trilha por visibilidade e a
    /// escalada de privilégio fechada (o papel da aplicação perde o INSERT em membro_empresa). Migração NOVA: a ObrasAuditoria
    /// já está na branch remota e não é editada.
    /// </summary>
    public partial class PerfisPermissoes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Colunas novas do membro, todas nulas (o backfill vem antes dos NOT NULL e dos gatilhos).
            // O xmin (versão da linha) é coluna de sistema do PostgreSQL: não há DDL para ele.
            migrationBuilder.AddColumn<DateTime>(
                name: "atualizado_em",
                schema: "cronoai",
                table: "membro_empresa",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "escopo_obras",
                schema: "cronoai",
                table: "membro_empresa",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "perfil",
                schema: "cronoai",
                table: "membro_empresa",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "removido_em",
                schema: "cronoai",
                table: "membro_empresa",
                type: "timestamp with time zone",
                nullable: true);

            // 2. Backfill (Q10): todo membro existente vira administrador com escopo "todas". Hoje só existem membros da semente de
            // desenvolvimento; ANTES de aplicar fora do local, a Infraestrutura confere a contagem por empresa (plano, seção 13).
            // Roda como migrador, sem contexto: por isso vem ANTES dos gatilhos (o de administrador o recusaria).
            migrationBuilder.ExecutarDmlComRls("membro_empresa", "UPDATE cronoai.membro_empresa SET perfil = 'administrador', escopo_obras = 'todas', atualizado_em = criado_em WHERE perfil IS NULL;");

            // 3. NOT NULL e CHECKs. Com dado real, NOT VALID + VALIDATE separado reduz o lock; o momento é da Infraestrutura.
            migrationBuilder.Sql("ALTER TABLE cronoai.membro_empresa ALTER COLUMN perfil SET NOT NULL;");
            migrationBuilder.Sql("ALTER TABLE cronoai.membro_empresa ALTER COLUMN escopo_obras SET NOT NULL;");
            migrationBuilder.Sql("ALTER TABLE cronoai.membro_empresa ALTER COLUMN atualizado_em SET NOT NULL;");

            migrationBuilder.AddCheckConstraint(
                name: "ck_membro_atualizado_apos_criado",
                schema: "cronoai",
                table: "membro_empresa",
                sql: "atualizado_em >= criado_em");

            migrationBuilder.AddCheckConstraint(
                name: "ck_membro_escopo",
                schema: "cronoai",
                table: "membro_empresa",
                sql: "escopo_obras IN ('todas', 'vinculadas', 'carteiras')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_membro_perfil",
                schema: "cronoai",
                table: "membro_empresa",
                sql: "perfil IN ('administrador', 'engenheiro_planejamento', 'engenheiro_obra', 'suprimentos', 'encarregado', 'gestor_portfolio', 'diretoria')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_membro_perfil_escopo",
                schema: "cronoai",
                table: "membro_empresa",
                sql: "(perfil = 'administrador' AND escopo_obras = 'todas') OR (perfil IN ('gestor_portfolio', 'diretoria') AND escopo_obras IN ('todas', 'carteiras')) OR (perfil IN ('engenheiro_planejamento', 'engenheiro_obra', 'suprimentos', 'encarregado') AND escopo_obras = 'vinculadas')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_membro_removido_apos_criado",
                schema: "cronoai",
                table: "membro_empresa",
                sql: "removido_em IS NULL OR removido_em >= criado_em");

            // 4. Tabelas novas.
            migrationBuilder.CreateTable(
                name: "acesso_obra",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    empresa_id = table.Column<Guid>(type: "uuid", nullable: false),
                    obra_id = table.Column<Guid>(type: "uuid", nullable: false),
                    usuario_id = table.Column<Guid>(type: "uuid", nullable: false),
                    criado_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_acesso_obra", x => x.id);
                    table.UniqueConstraint("ux_acesso_obra_obra_usuario", x => new { x.obra_id, x.usuario_id });
                    table.ForeignKey(
                        name: "fk_acesso_obra_membro",
                        columns: x => new { x.empresa_id, x.usuario_id },
                        principalSchema: "cronoai",
                        principalTable: "membro_empresa",
                        principalColumns: new[] { "empresa_id", "usuario_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_acesso_obra_obra",
                        columns: x => new { x.empresa_id, x.obra_id },
                        principalSchema: "cronoai",
                        principalTable: "obra",
                        principalColumns: new[] { "empresa_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "carteira",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    empresa_id = table.Column<Guid>(type: "uuid", nullable: false),
                    nome = table.Column<string>(type: "text", nullable: false),
                    tipo = table.Column<string>(type: "text", nullable: false),
                    versao = table.Column<long>(type: "bigint", rowVersion: true, nullable: false, defaultValue: 1L),
                    criada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    atualizada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    arquivada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_carteira", x => x.id);
                    table.UniqueConstraint("ux_carteira_empresa_id_id", x => new { x.empresa_id, x.id });
                    table.CheckConstraint("ck_carteira_arquivada_apos_criada", "arquivada_em IS NULL OR arquivada_em >= criada_em");
                    table.CheckConstraint("ck_carteira_atualizada_apos_criada", "atualizada_em >= criada_em");
                    table.CheckConstraint("ck_carteira_nome_tamanho", "char_length(nome) BETWEEN 1 AND 200");
                    table.CheckConstraint("ck_carteira_tipo", "tipo IN ('regional', 'cliente', 'gestor')");
                    table.CheckConstraint("ck_carteira_versao_positiva", "versao >= 1");
                    table.ForeignKey(
                        name: "fk_carteira_empresa",
                        column: x => x.empresa_id,
                        principalSchema: "cronoai",
                        principalTable: "empresa",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "frente",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    empresa_id = table.Column<Guid>(type: "uuid", nullable: false),
                    obra_id = table.Column<Guid>(type: "uuid", nullable: false),
                    nome = table.Column<string>(type: "text", nullable: false),
                    responsavel_id = table.Column<Guid>(type: "uuid", nullable: true),
                    responsavel_texto = table.Column<string>(type: "text", nullable: true),
                    versao = table.Column<long>(type: "bigint", rowVersion: true, nullable: false, defaultValue: 1L),
                    criada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    atualizada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    arquivada_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_frente", x => x.id);
                    table.UniqueConstraint("ux_frente_empresa_obra_id", x => new { x.empresa_id, x.obra_id, x.id });
                    table.CheckConstraint("ck_frente_arquivada_apos_criada", "arquivada_em IS NULL OR arquivada_em >= criada_em");
                    table.CheckConstraint("ck_frente_atualizada_apos_criada", "atualizada_em >= criada_em");
                    table.CheckConstraint("ck_frente_nome_tamanho", "char_length(nome) BETWEEN 1 AND 200");
                    table.CheckConstraint("ck_frente_responsavel_texto", "responsavel_texto IS NULL OR (char_length(responsavel_texto) BETWEEN 1 AND 120 AND responsavel_texto !~ '[[:cntrl:]]')");
                    table.CheckConstraint("ck_frente_responsavel_um_so", "responsavel_id IS NULL OR responsavel_texto IS NULL");
                    table.CheckConstraint("ck_frente_versao_positiva", "versao >= 1");
                    table.ForeignKey(
                        name: "fk_frente_obra",
                        columns: x => new { x.empresa_id, x.obra_id },
                        principalSchema: "cronoai",
                        principalTable: "obra",
                        principalColumns: new[] { "empresa_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_frente_responsavel",
                        columns: x => new { x.empresa_id, x.responsavel_id },
                        principalSchema: "cronoai",
                        principalTable: "membro_empresa",
                        principalColumns: new[] { "empresa_id", "usuario_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "acesso_carteira",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    empresa_id = table.Column<Guid>(type: "uuid", nullable: false),
                    carteira_id = table.Column<Guid>(type: "uuid", nullable: false),
                    usuario_id = table.Column<Guid>(type: "uuid", nullable: false),
                    criado_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_acesso_carteira", x => x.id);
                    table.UniqueConstraint("ux_acesso_carteira_carteira_usuario", x => new { x.carteira_id, x.usuario_id });
                    table.ForeignKey(
                        name: "fk_acesso_carteira_carteira",
                        columns: x => new { x.empresa_id, x.carteira_id },
                        principalSchema: "cronoai",
                        principalTable: "carteira",
                        principalColumns: new[] { "empresa_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_acesso_carteira_membro",
                        columns: x => new { x.empresa_id, x.usuario_id },
                        principalSchema: "cronoai",
                        principalTable: "membro_empresa",
                        principalColumns: new[] { "empresa_id", "usuario_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "carteira_obra",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    empresa_id = table.Column<Guid>(type: "uuid", nullable: false),
                    carteira_id = table.Column<Guid>(type: "uuid", nullable: false),
                    obra_id = table.Column<Guid>(type: "uuid", nullable: false),
                    criado_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_carteira_obra", x => x.id);
                    table.UniqueConstraint("ux_carteira_obra_carteira_obra", x => new { x.carteira_id, x.obra_id });
                    table.ForeignKey(
                        name: "fk_carteira_obra_carteira",
                        columns: x => new { x.empresa_id, x.carteira_id },
                        principalSchema: "cronoai",
                        principalTable: "carteira",
                        principalColumns: new[] { "empresa_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_carteira_obra_obra",
                        columns: x => new { x.empresa_id, x.obra_id },
                        principalSchema: "cronoai",
                        principalTable: "obra",
                        principalColumns: new[] { "empresa_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "acesso_frente",
                schema: "cronoai",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    empresa_id = table.Column<Guid>(type: "uuid", nullable: false),
                    obra_id = table.Column<Guid>(type: "uuid", nullable: false),
                    frente_id = table.Column<Guid>(type: "uuid", nullable: false),
                    usuario_id = table.Column<Guid>(type: "uuid", nullable: false),
                    criado_em = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_acesso_frente", x => x.id);
                    table.UniqueConstraint("ux_acesso_frente_frente_usuario", x => new { x.frente_id, x.usuario_id });
                    table.ForeignKey(
                        name: "fk_acesso_frente_acesso_obra",
                        columns: x => new { x.obra_id, x.usuario_id },
                        principalSchema: "cronoai",
                        principalTable: "acesso_obra",
                        principalColumns: new[] { "obra_id", "usuario_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_acesso_frente_frente",
                        columns: x => new { x.empresa_id, x.obra_id, x.frente_id },
                        principalSchema: "cronoai",
                        principalTable: "frente",
                        principalColumns: new[] { "empresa_id", "obra_id", "id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_acesso_carteira_empresa_id_carteira_id",
                schema: "cronoai",
                table: "acesso_carteira",
                columns: new[] { "empresa_id", "carteira_id" });

            migrationBuilder.CreateIndex(
                name: "ix_acesso_carteira_empresa_id_usuario_id",
                schema: "cronoai",
                table: "acesso_carteira",
                columns: new[] { "empresa_id", "usuario_id" });

            migrationBuilder.CreateIndex(
                name: "ix_acesso_carteira_usuario",
                schema: "cronoai",
                table: "acesso_carteira",
                columns: new[] { "usuario_id", "carteira_id" });

            migrationBuilder.CreateIndex(
                name: "ix_acesso_frente_empresa_id_obra_id_frente_id",
                schema: "cronoai",
                table: "acesso_frente",
                columns: new[] { "empresa_id", "obra_id", "frente_id" });

            migrationBuilder.CreateIndex(
                name: "ix_acesso_frente_obra_id_usuario_id",
                schema: "cronoai",
                table: "acesso_frente",
                columns: new[] { "obra_id", "usuario_id" });

            migrationBuilder.CreateIndex(
                name: "ix_acesso_frente_usuario",
                schema: "cronoai",
                table: "acesso_frente",
                columns: new[] { "usuario_id", "frente_id" });

            migrationBuilder.CreateIndex(
                name: "ix_acesso_obra_empresa_id_usuario_id",
                schema: "cronoai",
                table: "acesso_obra",
                columns: new[] { "empresa_id", "usuario_id" });

            migrationBuilder.CreateIndex(
                name: "ix_acesso_obra_empresa_obra",
                schema: "cronoai",
                table: "acesso_obra",
                columns: new[] { "empresa_id", "obra_id" });

            migrationBuilder.CreateIndex(
                name: "ix_acesso_obra_usuario",
                schema: "cronoai",
                table: "acesso_obra",
                columns: new[] { "usuario_id", "obra_id" });

            migrationBuilder.CreateIndex(
                name: "ix_carteira_obra_empresa_id_carteira_id",
                schema: "cronoai",
                table: "carteira_obra",
                columns: new[] { "empresa_id", "carteira_id" });

            migrationBuilder.CreateIndex(
                name: "ix_carteira_obra_empresa_id_obra_id",
                schema: "cronoai",
                table: "carteira_obra",
                columns: new[] { "empresa_id", "obra_id" });

            migrationBuilder.CreateIndex(
                name: "ix_carteira_obra_obra",
                schema: "cronoai",
                table: "carteira_obra",
                columns: new[] { "obra_id", "carteira_id" });

            migrationBuilder.CreateIndex(
                name: "ix_frente_empresa_id_responsavel_id",
                schema: "cronoai",
                table: "frente",
                columns: new[] { "empresa_id", "responsavel_id" });

            migrationBuilder.CreateIndex(
                name: "ix_frente_empresa_obra",
                schema: "cronoai",
                table: "frente",
                columns: new[] { "empresa_id", "obra_id" });

            // Nome único entre as frentes (por obra) e entre as carteiras (por empresa e tipo) NÃO arquivadas, sem diferenciar
            // caixa. Índices parciais e por expressão: o EF não os expressa, então vivem só aqui e só o teste de banco os protege.
            migrationBuilder.Sql(
                "CREATE UNIQUE INDEX ux_frente_obra_nome_ativa ON cronoai.frente (obra_id, lower(nome)) WHERE arquivada_em IS NULL;");
            migrationBuilder.Sql(
                "CREATE UNIQUE INDEX ux_carteira_empresa_tipo_nome_ativa ON cronoai.carteira (empresa_id, tipo, lower(nome)) WHERE arquivada_em IS NULL;");

            // 5. Funções e gatilhos (DEPOIS do backfill). search_path fixo e nomes qualificados: a função não depende do caminho
            // de busca de quem a dispara. CREATE FUNCTION sem OR REPLACE: recriar por engano falha em vez de trocar o corpo.
            // Versão de frente e carteira: o gatilho soma 1 em todo UPDATE e ignora o valor enviado (padrão do trg_obra_versao).
            migrationBuilder.Sql(
                """
                CREATE FUNCTION cronoai.incrementa_versao() RETURNS trigger
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
                "CREATE TRIGGER trg_frente_versao BEFORE UPDATE ON cronoai.frente FOR EACH ROW EXECUTE FUNCTION cronoai.incrementa_versao();");
            migrationBuilder.Sql(
                "CREATE TRIGGER trg_carteira_versao BEFORE UPDATE ON cronoai.carteira FOR EACH ROW EXECUTE FUNCTION cronoai.incrementa_versao();");

            // Só administrador ativo da empresa da linha altera membro (inclusive o próprio perfil). É GATILHO, e não política de
            // UPDATE, porque uma política que consulta a própria tabela dispara a recursão 42P17 do RLS. O gatilho lê membro_empresa
            // sob o RLS do chamador (a política de SELECT mostra a empresa do contexto), sem recursão.
            migrationBuilder.Sql(
                """
                CREATE FUNCTION cronoai.membro_exige_administrador() RETURNS trigger
                LANGUAGE plpgsql
                SET search_path = pg_catalog
                AS $$
                DECLARE
                  v_usuario uuid := NULLIF(current_setting('app.usuario_id', true), '')::uuid;
                  v_empresa uuid := NULLIF(current_setting('app.empresa_id', true), '')::uuid;
                BEGIN
                  IF v_usuario IS NULL OR v_empresa IS NULL OR v_empresa <> OLD.empresa_id OR NOT EXISTS (
                       SELECT 1 FROM cronoai.membro_empresa m
                        WHERE m.empresa_id = OLD.empresa_id AND m.usuario_id = v_usuario
                          AND m.perfil = 'administrador' AND m.removido_em IS NULL) THEN
                    RAISE EXCEPTION 'apenas o administrador da empresa altera membro' USING ERRCODE = 'insufficient_privilege';
                  END IF;
                  RETURN NEW;
                END
                $$;
                """);
            migrationBuilder.Sql(
                "CREATE TRIGGER trg_membro_exige_administrador BEFORE UPDATE ON cronoai.membro_empresa FOR EACH ROW EXECUTE FUNCTION cronoai.membro_exige_administrador();");
            migrationBuilder.Sql("ALTER TABLE cronoai.membro_empresa ENABLE ALWAYS TRIGGER trg_membro_exige_administrador;");

            // Último administrador: nenhuma empresa fica sem administrador ativo. Gatilho de restrição DIFERIDO (roda no COMMIT, e
            // por isso aceita "promover B e rebaixar A" na mesma transação). O advisory lock por empresa serializa dois rebaixamentos
            // concorrentes (em READ COMMITTED cada um ainda veria o outro como administrador). O CONSTRAINT do RAISE chega ao cliente
            // como PostgresException.ConstraintName, que a API mapeia para 409.
            // ATENÇÃO: o gatilho SÓ é correto em READ COMMITTED (o padrão do PostgreSQL e o único nível que a aplicação usa). Em
            // REPEATABLE READ ou SERIALIZABLE a consulta de dentro do gatilho enxergaria o snapshot da transação, e não o commit do
            // concorrente que acabou de sair do lock: dois rebaixamentos poderiam passar. Não eleve o nível de isolamento sem reabrir isto
            // (ADR 00010). Forma de duas chaves do lock: classe 14001 (constante deste gatilho; evita colidir com outro uso de advisory
            // lock no banco) + hash da empresa, ambos int4.
            migrationBuilder.Sql(
                """
                CREATE FUNCTION cronoai.membro_garante_administrador() RETURNS trigger
                LANGUAGE plpgsql
                SET search_path = pg_catalog
                AS $$
                BEGIN
                  PERFORM pg_advisory_xact_lock(14001, hashtext(NEW.empresa_id::text));
                  IF NOT EXISTS (
                       SELECT 1 FROM cronoai.membro_empresa m
                        WHERE m.empresa_id = NEW.empresa_id AND m.perfil = 'administrador' AND m.removido_em IS NULL) THEN
                    RAISE EXCEPTION 'a empresa precisa de ao menos um administrador ativo'
                      USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_empresa_tem_administrador';
                  END IF;
                  RETURN NULL;
                END
                $$;
                """);
            migrationBuilder.Sql(
                "CREATE CONSTRAINT TRIGGER trg_membro_garante_administrador AFTER INSERT OR UPDATE ON cronoai.membro_empresa DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cronoai.membro_garante_administrador();");
            migrationBuilder.Sql("ALTER TABLE cronoai.membro_empresa ENABLE ALWAYS TRIGGER trg_membro_garante_administrador;");

            // 6. Privilégios (o Inicial concede DML geral por padrão; revoga-se o que nenhum código usa).
            // ESCALADA DE PRIVILÉGIO FECHADA: a política de INSERT de membro_empresa deixava criar vínculo para QUALQUER usuario_id.
            // O papel da aplicação perde o INSERT (camada 1) e a política é removida (camada 2). O 00014c devolve o GRANT junto com
            // a política do convite.
            migrationBuilder.Sql("REVOKE INSERT ON cronoai.membro_empresa FROM cronoai_app;");
            migrationBuilder.Sql("GRANT UPDATE (perfil, escopo_obras, removido_em, atualizado_em) ON cronoai.membro_empresa TO cronoai_app;");
            migrationBuilder.Sql("REVOKE DELETE ON cronoai.frente FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE DELETE ON cronoai.carteira FROM cronoai_app;");

            // Vínculo é imutável: só se insere ou apaga.
            migrationBuilder.Sql("REVOKE UPDATE ON cronoai.acesso_obra FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE UPDATE ON cronoai.acesso_frente FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE UPDATE ON cronoai.carteira_obra FROM cronoai_app;");
            migrationBuilder.Sql("REVOKE UPDATE ON cronoai.acesso_carteira FROM cronoai_app;");

            // 7. RLS: FORCE nas 6 tabelas novas + políticas por comando (fragmentos em ExpressoesPermissao; nada copiado à mão).
            var e = MigrationBuilderRlsExtensoes.ExpressaoEmpresa;
            var u = MigrationBuilderRlsExtensoes.ExpressaoUsuario;
            var admin = ExpressoesPermissao.Admin;
            var todas = ExpressoesPermissao.Todas;
            var carteirasMinhas = ExpressoesPermissao.CarteirasMinhas;

            // empresa: o vínculo precisa estar ATIVO.
            migrationBuilder.SubstituirPoliticaSelect(
                "empresa",
                "pol_empresa_select",
                $"id = {e} OR EXISTS (SELECT 1 FROM cronoai.membro_empresa m WHERE m.empresa_id = empresa.id AND m.usuario_id = {u} AND m.removido_em IS NULL)");

            // membro_empresa: SELECT inalterada; INSERT removida (sem substituta); UPDATE por empresa + gatilho de administrador.
            migrationBuilder.RemoverPolitica("membro_empresa", "pol_membro_empresa_insert");
            migrationBuilder.PoliticaUpdate("membro_empresa", "pol_membro_empresa_update", $"empresa_id = {e}", $"empresa_id = {e}");

            // obra: visibilidade por escopo; criar só com escopo "todas" (o INSERT ... RETURNING aplica o SELECT à linha nova).
            var visibilidadeDaObra = ExpressoesPermissao.VisibilidadeDaObra();
            migrationBuilder.SubstituirPoliticaSelect("obra", "pol_obra_select", visibilidadeDaObra);
            migrationBuilder.SubstituirPoliticaInsert("obra", "pol_obra_insert", $"empresa_id = {e} AND {todas}");
            migrationBuilder.SubstituirPoliticaUpdate("obra", "pol_obra_update", visibilidadeDaObra, visibilidadeDaObra);

            // Leitura do vínculo: o próprio usuário, o administrador, ou o gestor SÓ no alcance dele (escopo todas ou obra de carteira
            // sua). Antes o gestor lia os vínculos da empresa inteira.
            var lerVinculo = $"empresa_id = {e} AND (usuario_id = {u} OR {admin} OR {ExpressoesPermissao.AlcanceGestor("obra_id")})";

            migrationBuilder.HabilitarRlsForcado("acesso_obra");
            var escreverAcessoObra = $"empresa_id = {e} AND ({admin} OR {ExpressoesPermissao.AlcanceGestor("obra_id")})";
            migrationBuilder.PoliticaSelect("acesso_obra", "pol_acesso_obra_select", lerVinculo);
            migrationBuilder.PoliticaInsert("acesso_obra", "pol_acesso_obra_insert", escreverAcessoObra);
            migrationBuilder.PoliticaDelete("acesso_obra", "pol_acesso_obra_delete", escreverAcessoObra);

            migrationBuilder.HabilitarRlsForcado("frente");
            var daFrente = $"empresa_id = {e} AND {ExpressoesPermissao.ObraVisivel("obra_id")}";
            migrationBuilder.PoliticaSelect("frente", "pol_frente_select", daFrente);
            migrationBuilder.PoliticaInsert("frente", "pol_frente_insert", daFrente);
            migrationBuilder.PoliticaUpdate("frente", "pol_frente_update", daFrente, daFrente);

            migrationBuilder.HabilitarRlsForcado("acesso_frente");
            migrationBuilder.PoliticaSelect("acesso_frente", "pol_acesso_frente_select", lerVinculo);
            migrationBuilder.PoliticaInsert("acesso_frente", "pol_acesso_frente_insert", escreverAcessoObra);
            migrationBuilder.PoliticaDelete("acesso_frente", "pol_acesso_frente_delete", escreverAcessoObra);

            migrationBuilder.HabilitarRlsForcado("carteira");
            var soAdministrador = $"empresa_id = {e} AND {admin}";
            migrationBuilder.PoliticaSelect("carteira", "pol_carteira_select", $"empresa_id = {e} AND ({todas} OR id IN ({carteirasMinhas}))");
            migrationBuilder.PoliticaInsert("carteira", "pol_carteira_insert", soAdministrador);
            migrationBuilder.PoliticaUpdate("carteira", "pol_carteira_update", soAdministrador, soAdministrador);

            // carteira_obra filtra pela CARTEIRA, e não pela obra visível: a política de obra a cita (regra de recursão).
            migrationBuilder.HabilitarRlsForcado("carteira_obra");
            migrationBuilder.PoliticaSelect("carteira_obra", "pol_carteira_obra_select", $"empresa_id = {e} AND ({todas} OR carteira_id IN ({carteirasMinhas}))");
            migrationBuilder.PoliticaInsert("carteira_obra", "pol_carteira_obra_insert", soAdministrador);
            migrationBuilder.PoliticaDelete("carteira_obra", "pol_carteira_obra_delete", soAdministrador);

            migrationBuilder.HabilitarRlsForcado("acesso_carteira");
            migrationBuilder.PoliticaSelect("acesso_carteira", "pol_acesso_carteira_select", $"empresa_id = {e} AND (usuario_id = {u} OR {admin})");
            migrationBuilder.PoliticaInsert("acesso_carteira", "pol_acesso_carteira_insert", soAdministrador);
            migrationBuilder.PoliticaDelete("acesso_carteira", "pol_acesso_carteira_delete", soAdministrador);

            // Trilha: leitura pela visibilidade da obra (a da empresa, sem obra, só o administrador) e INSERT atribuído ao próprio
            // usuário do contexto (fecha a lacuna do 00013, em que dava para gravar trilha em nome de outro). Só SELECT e INSERT.
            migrationBuilder.SubstituirPoliticaSelect(
                "auditoria",
                "pol_auditoria_select",
                $"empresa_id = {e} AND ((obra_id IS NULL AND {admin}) OR (obra_id IS NOT NULL AND {ExpressoesPermissao.ObraVisivel("obra_id")}))");
            migrationBuilder.SubstituirPoliticaInsert(
                "auditoria",
                "pol_auditoria_insert",
                $"empresa_id = {e} AND usuario_id = {u} AND ((obra_id IS NULL AND {admin}) OR (obra_id IS NOT NULL AND {ExpressoesPermissao.ObraVisivel("obra_id")}))");

            // 8. A trilha ganha a ação "remover" (revogar vínculo e remover membro).
            migrationBuilder.DropCheckConstraint(
                name: "ck_auditoria_acao",
                schema: "cronoai",
                table: "auditoria");

            migrationBuilder.AddCheckConstraint(
                name: "ck_auditoria_acao",
                schema: "cronoai",
                table: "auditoria",
                sql: "acao IN ('criar', 'alterar', 'arquivar', 'restaurar', 'remover')");

            // 9. Conferência final: a migração falha ruidosamente se alguma garantia não ficou de pé.
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                  IF EXISTS (
                       SELECT 1 FROM pg_attribute a
                        WHERE a.attrelid = 'cronoai.membro_empresa'::regclass
                          AND a.attname IN ('perfil', 'escopo_obras', 'atualizado_em') AND NOT a.attnotnull) THEN
                    RAISE EXCEPTION 'membro_empresa com perfil, escopo ou atualizado_em sem NOT NULL';
                  END IF;
                  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'cronoai' AND tablename = 'auditoria') <> 2
                     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'cronoai' AND tablename = 'auditoria' AND cmd IN ('SELECT', 'INSERT')) <> 2 THEN
                    RAISE EXCEPTION 'auditoria precisa ter exatamente as politicas de SELECT e INSERT';
                  END IF;
                  IF (SELECT count(*) FROM pg_trigger t
                       WHERE t.tgname IN ('trg_auditoria_append_only', 'trg_membro_exige_administrador', 'trg_membro_garante_administrador')
                         AND t.tgenabled = 'A') <> 3 THEN
                    RAISE EXCEPTION 'gatilho de trilha ou de membro sem ENABLE ALWAYS';
                  END IF;
                  IF has_table_privilege('cronoai_app', 'cronoai.membro_empresa', 'INSERT') THEN
                    RAISE EXCEPTION 'cronoai_app nao pode inserir em membro_empresa';
                  END IF;
                END
                $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Reversão ESTRUTURAL, com perda dos dados novos (aceitável sem produção). Restaura LITERALMENTE os predicados do 00012
            // (empresa e membro_empresa) e do 00013 (obra e auditoria), ANTES de apagar as tabelas que as políticas novas citam.
            // Só vale em banco sem trilha "remover" (a trilha é append-only e o CHECK antigo não a aceita).
            var e = MigrationBuilderRlsExtensoes.ExpressaoEmpresa;
            var u = MigrationBuilderRlsExtensoes.ExpressaoUsuario;

            migrationBuilder.SubstituirPoliticaSelect(
                "empresa",
                "pol_empresa_select",
                $"id = {e} OR EXISTS (SELECT 1 FROM cronoai.membro_empresa m WHERE m.empresa_id = empresa.id AND m.usuario_id = {u})");
            migrationBuilder.SubstituirPoliticaSelect("obra", "pol_obra_select", $"empresa_id = {e}");
            migrationBuilder.SubstituirPoliticaInsert("obra", "pol_obra_insert", $"empresa_id = {e}");
            migrationBuilder.SubstituirPoliticaUpdate("obra", "pol_obra_update", $"empresa_id = {e}", $"empresa_id = {e}");
            migrationBuilder.SubstituirPoliticaSelect("auditoria", "pol_auditoria_select", $"empresa_id = {e}");
            migrationBuilder.SubstituirPoliticaInsert("auditoria", "pol_auditoria_insert", $"empresa_id = {e}");

            migrationBuilder.RemoverPolitica("membro_empresa", "pol_membro_empresa_update");
            migrationBuilder.PoliticaInsert("membro_empresa", "pol_membro_empresa_insert", $"empresa_id = {e}");

            migrationBuilder.Sql("REVOKE UPDATE ON cronoai.membro_empresa FROM cronoai_app;");
            migrationBuilder.Sql("GRANT INSERT ON cronoai.membro_empresa TO cronoai_app;");

            // As políticas das tabelas novas citam umas às outras (carteira cita acesso_carteira, que tem FK para carteira): sem
            // tirá-las antes, nenhuma ordem de DROP TABLE serve (e CASCADE é proibido).
            foreach (var (tabela, politicas) in new[]
            {
                ("acesso_obra", new[] { "pol_acesso_obra_select", "pol_acesso_obra_insert", "pol_acesso_obra_delete" }),
                ("frente", new[] { "pol_frente_select", "pol_frente_insert", "pol_frente_update" }),
                ("acesso_frente", new[] { "pol_acesso_frente_select", "pol_acesso_frente_insert", "pol_acesso_frente_delete" }),
                ("carteira", new[] { "pol_carteira_select", "pol_carteira_insert", "pol_carteira_update" }),
                ("carteira_obra", new[] { "pol_carteira_obra_select", "pol_carteira_obra_insert", "pol_carteira_obra_delete" }),
                ("acesso_carteira", new[] { "pol_acesso_carteira_select", "pol_acesso_carteira_insert", "pol_acesso_carteira_delete" }),
            })
            {
                foreach (var politica in politicas)
                {
                    migrationBuilder.RemoverPolitica(tabela, politica);
                }
            }

            migrationBuilder.Sql("DROP TRIGGER trg_membro_garante_administrador ON cronoai.membro_empresa;");
            migrationBuilder.Sql("DROP TRIGGER trg_membro_exige_administrador ON cronoai.membro_empresa;");

            migrationBuilder.DropTable(
                name: "acesso_carteira",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "acesso_frente",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "carteira_obra",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "acesso_obra",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "frente",
                schema: "cronoai");

            migrationBuilder.DropTable(
                name: "carteira",
                schema: "cronoai");

            // As tabelas levam os gatilhos e os índices parciais; as funções são objetos à parte.
            migrationBuilder.Sql("DROP FUNCTION cronoai.membro_garante_administrador();");
            migrationBuilder.Sql("DROP FUNCTION cronoai.membro_exige_administrador();");
            migrationBuilder.Sql("DROP FUNCTION cronoai.incrementa_versao();");

            migrationBuilder.DropCheckConstraint(
                name: "ck_membro_atualizado_apos_criado",
                schema: "cronoai",
                table: "membro_empresa");

            migrationBuilder.DropCheckConstraint(
                name: "ck_membro_escopo",
                schema: "cronoai",
                table: "membro_empresa");

            migrationBuilder.DropCheckConstraint(
                name: "ck_membro_perfil",
                schema: "cronoai",
                table: "membro_empresa");

            migrationBuilder.DropCheckConstraint(
                name: "ck_membro_perfil_escopo",
                schema: "cronoai",
                table: "membro_empresa");

            migrationBuilder.DropCheckConstraint(
                name: "ck_membro_removido_apos_criado",
                schema: "cronoai",
                table: "membro_empresa");

            migrationBuilder.DropCheckConstraint(
                name: "ck_auditoria_acao",
                schema: "cronoai",
                table: "auditoria");

            migrationBuilder.DropColumn(
                name: "atualizado_em",
                schema: "cronoai",
                table: "membro_empresa");

            migrationBuilder.DropColumn(
                name: "escopo_obras",
                schema: "cronoai",
                table: "membro_empresa");

            migrationBuilder.DropColumn(
                name: "perfil",
                schema: "cronoai",
                table: "membro_empresa");

            migrationBuilder.DropColumn(
                name: "removido_em",
                schema: "cronoai",
                table: "membro_empresa");

            migrationBuilder.AddCheckConstraint(
                name: "ck_auditoria_acao",
                schema: "cronoai",
                table: "auditoria",
                sql: "acao IN ('criar', 'alterar', 'arquivar', 'restaurar')");
        }
    }
}
