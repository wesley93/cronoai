// Teste da regra R08 (senha literal). Rodar: node --test .claude/scripts/lib/regras-cronoai.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { temSenhaLiteral } from './regras-cronoai.mjs'

const DEVE_ACUSAR = [
  'Host=x;Password=abc123;',
  'Host=x;PASSWORD = Segredo123;',
  'Host=x;Pwd=$ecret',
  'Host=x;Password=@bc',
  '"Password": "abc"',
  // a palavra "example" no host não pode esconder a senha: só o VALOR é avaliado
  'Host=db.example.com;Username=u;Password=SenhaReal123',
  "Host=x;Password='abc def'",
]

const NAO_DEVE_ACUSAR = [
  'Password = senha,', // inicializador C#
  'PASSWORD %L',
  'Host=x;Password=<senha-app>',
  'Host=x;Password=${SENHA}',
  'Host=x;Password=$SENHA',
  '$"Host={h};Username=u;Password={senha}"', // interpolação C#
  'Host=x;Password=$env:CRONOAI_DB_SENHA_APP', // PowerShell
  '"Password": "<defina>"',
  'Host=localhost;Database=cronoai;Username=ef_design',
]

for (const linha of DEVE_ACUSAR) {
  test(`acusa: ${linha}`, () => {
    assert.equal(temSenhaLiteral(linha), true)
  })
}

for (const linha of NAO_DEVE_ACUSAR) {
  test(`não acusa: ${linha}`, () => {
    assert.equal(temSenhaLiteral(linha), false)
  })
}

// ---------------------------------------------------------------------------------------------------------------
// R14 a R17 (backend .NET, server/src). Cada caso: [arquivo, linha, ids esperados].
// ---------------------------------------------------------------------------------------------------------------
import { regrasBackend } from './regras-cronoai.mjs'

const ids = (arquivo, linha) => regrasBackend(arquivo, linha).map((x) => x.id)
const API = 'server/src/CronoAI.Api/Empresas/EmpresasEndpoints.cs'
const MIGRACAO = 'server/src/CronoAI.Dados/Migrations/20261025113548_IdentidadeEmpresas.cs'
const RLS = 'server/src/CronoAI.Dados/Rls/MigrationBuilderRlsExtensoes.cs'
const HELPER = 'server/src/CronoAI.Dados/Rls/MigracaoDeDadosRls.cs'
const IDENTIDADE = 'server/src/CronoAI.Dados/Identidade/ConsultasIdentidade.cs'
const DESIGN = 'server/src/CronoAI.Dados/CronoDbContextDesignTimeFactory.cs'

const ACUSA = [
  ['R14 FromSqlRaw', API, 'var x = db.Empresas.FromSqlRaw("SELECT 1");', ['R14']],
  ['R14 ExecuteSqlRawAsync', API, 'await db.Database.ExecuteSqlRawAsync(sql);', ['R14']],
  ['R14 SqlQueryRaw', IDENTIDADE, 'db.Database.SqlQueryRaw<int>(sql)', ['R14']],
  ['R15 CREATE POLICY na Api', API, 'cmd.CommandText = "CREATE POLICY p ON cronoai.t FOR SELECT";', ['R15']],
  ['R15 ALTER TABLE na Api', API, 'cmd.CommandText = "ALTER TABLE cronoai.t ADD x int";', ['R15']],
  ['R15 FORCE ROW LEVEL SECURITY fora do helper', IDENTIDADE, 'sql = "ALTER TABLE x FORCE ROW LEVEL SECURITY";', ['R15']],
  ['R15 DML em Migrations fora do helper', MIGRACAO, 'migrationBuilder.Sql("UPDATE cronoai.empresa SET nome = \'x\' WHERE id = 1");', ['R15']],
  ['R15 INSERT em Migrations', MIGRACAO, 'migrationBuilder.Sql("INSERT INTO cronoai.empresa VALUES (1)");', ['R15']],
  ['R16 IgnoreQueryFilters fora da lista', API, 'db.Membros.IgnoreQueryFilters(["Empresa"])', ['R16']],
  ['R17 new NpgsqlConnection', API, 'await using var c = new NpgsqlConnection(cs);', ['R17']],
  ['R17 NpgsqlDataSource', IDENTIDADE, 'var fonte = NpgsqlDataSource.Create(cs);', ['R17']],
]

const NAO_ACUSA = [
  ['DDL em Migrations', MIGRACAO, 'migrationBuilder.Sql("CREATE POLICY p ON cronoai.t FOR SELECT");'],
  ['DDL no helper Rls', RLS, 'migrationBuilder.Sql($"ALTER TABLE {t} FORCE ROW LEVEL SECURITY;");'],
  ['DML no helper de migração de dados', HELPER, 'sqlDml = "UPDATE cronoai.t SET x = 1"; // NO FORCE -> DML -> FORCE'],
  ['DML pelo helper dentro da migração', MIGRACAO, 'migrationBuilder.ExecutarDmlComRls("empresa", "UPDATE cronoai.empresa SET nome = nome WHERE id = 1");'],
  ['NpgsqlConnectionStringBuilder', API, 'var b = new NpgsqlConnectionStringBuilder(cs);'],
  ['NpgsqlConnection no design-time', DESIGN, 'using var c = new NpgsqlConnection(cs);'],
  ['IgnoreQueryFilters em ConsultasIdentidade', IDENTIDADE, 'contexto.Membros.IgnoreQueryFilters(_ignorarFiltroEmpresa)'],
  ['comentário com FromSqlRaw', API, '// nunca FromSqlRaw com texto montado'],
  ['comentário de documentação com CREATE POLICY', API, '/// usa CREATE POLICY só nas migrações'],
  ['SQL interpolado (FromSql, ExecuteSql)', IDENTIDADE, 'await db.Database.ExecuteSqlAsync($"DELETE FROM cronoai.sessao WHERE id = {id}");'],
  ['teste (server/tests) fica de fora', 'server/tests/CronoAI.Api.Testes/Dados/RlsTestes.cs', 'var c = new NpgsqlConnection(cs); // FromSqlRaw CREATE TABLE'],
  ['arquivo fora de server/src', 'src/lib/cpm.ts', 'const x = "CREATE TABLE y"'],
]

for (const [nome, arquivo, linha, esperados] of ACUSA) {
  test(`backend acusa: ${nome}`, () => {
    assert.deepEqual(ids(arquivo, linha), esperados)
  })
}

for (const [nome, arquivo, linha] of NAO_ACUSA) {
  test(`backend não acusa: ${nome}`, () => {
    assert.deepEqual(ids(arquivo, linha), [])
  })
}

// ---------------------------------------------------------------------------------------------------------------
// R15 confere LINHA a LINHA (não o arquivo): uma migração com um ExecutarDmlComRls NÃO libera um UPDATE solto em outra linha.
// ---------------------------------------------------------------------------------------------------------------
import { aplicarRegras } from './regras-cronoai.mjs'

test('backend R15: UPDATE solto em outra linha da mesma migração é acusado (só ela)', () => {
  const novas = new Map([
    [
      MIGRACAO,
      [
        { n: 10, texto: 'migrationBuilder.ExecutarDmlComRls("empresa", "UPDATE cronoai.empresa SET nome = nome WHERE id = 1");' },
        { n: 11, texto: 'migrationBuilder.Sql("UPDATE cronoai.empresa SET nome = \'x\' WHERE id = 2");' },
      ],
    ],
  ])

  const achados = aplicarRegras({ arquivos: [MIGRACAO], novas }).filter((x) => x.id === 'R15')

  assert.equal(achados.length, 1)
  assert.equal(achados[0].linha, 11)
})

// ---------------------------------------------------------------------------------------------------------------
// R18 (bloqueia): escrita fora do SaveChanges nas entidades auditadas. Ciclo 00013, ADR 00009.
// ---------------------------------------------------------------------------------------------------------------
const OBRAS_API = 'server/src/CronoAI.Api/Obras/ServicoObras.cs'
const AUDITORIA_DADOS = 'server/src/CronoAI.Dados/Auditoria/ConsultasAuditoria.cs'
const MIGRACAO_OBRAS = 'server/src/CronoAI.Dados/Migrations/20261025173934_ObrasAuditoria.cs'

const R18_ACUSA = [
  ['ExecuteUpdateAsync em Api/Obras', OBRAS_API, 'await _banco.Obras.Where(o => o.Id == id).ExecuteUpdateAsync(s => s.SetProperty(o => o.Nome, "x"));'],
  ['ExecuteDelete em Dados/Auditoria', AUDITORIA_DADOS, 'db.Auditorias.Where(a => a.Id > 0).ExecuteDelete();'],
  ['ExecuteDeleteAsync em qualquer lugar de src', 'server/src/CronoAI.Api/Empresas/EmpresasEndpoints.cs', 'await db.Membros.ExecuteDeleteAsync(cancelamento);'],
  ['ExecuteSqlAsync de UPDATE em cronoai.obra', OBRAS_API, 'await db.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET nome = {nome} WHERE id = {id}");'],
  ['ExecuteSql de DELETE em cronoai.auditoria', AUDITORIA_DADOS, 'db.Database.ExecuteSql($"DELETE FROM cronoai.auditoria WHERE id = {id}");'],
  ['SqlQuery de INSERT em cronoai.auditoria', AUDITORIA_DADOS, 'db.Database.SqlQuery<int>($"INSERT INTO cronoai.auditoria (id) VALUES ({id}) RETURNING id");'],
  ['FromSql de UPDATE em cronoai.obra', OBRAS_API, 'db.Obras.FromSql($"UPDATE cronoai.obra SET nome = {x} RETURNING *");'],
]

const R18_NAO_ACUSA = [
  ['ExecuteUpdateAsync em ConsultasIdentidade.cs (só sessao)', 'server/src/CronoAI.Dados/Identidade/ConsultasIdentidade.cs', '.ExecuteUpdateAsync(set => set.SetProperty(s => s.EncerradaEm, agoraUtc), cancelamento);'],
  ['ExecuteDeleteAsync em ConsultasIdentidade.cs', 'server/src/CronoAI.Dados/Identidade/ConsultasIdentidade.cs', '.ExecuteDeleteAsync(cancelamento);'],
  ['comentário com ExecuteUpdate', OBRAS_API, '// nunca ExecuteUpdateAsync nem ExecuteDelete aqui'],
  ['comentário de documentação com UPDATE cronoai.obra', OBRAS_API, '/// não use ExecuteSql com UPDATE cronoai.obra'],
  ['teste (server/tests) fica de fora', 'server/tests/CronoAI.Api.Testes/Dados/RlsObraAuditoriaTestes.cs', 'await c.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET nome = {n}"); x.ExecuteUpdateAsync(s => s);'],
  ['CREATE TRIGGER sobre cronoai.auditoria em Migrations/', MIGRACAO_OBRAS, 'migrationBuilder.Sql("CREATE TRIGGER trg_auditoria_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON cronoai.auditoria FOR EACH STATEMENT EXECUTE FUNCTION cronoai.auditoria_recusa_alteracao();");'],
  ['REVOKE em Migrations/', MIGRACAO_OBRAS, 'migrationBuilder.Sql("REVOKE UPDATE, DELETE, TRUNCATE ON cronoai.auditoria FROM cronoai_app;");'],
  ['SELECT em cronoai.auditoria', AUDITORIA_DADOS, 'db.Database.SqlQuery<long>($"SELECT count(*) AS \\"Value\\" FROM cronoai.auditoria WHERE obra_id = {id}");'],
  ['UPDATE em outra tabela (usuario) por ExecuteSql', 'server/src/CronoAI.Api/Desenvolvimento/SementeDesenvolvimento.cs', 'await db.Database.ExecuteSqlAsync($"UPDATE cronoai.usuario SET nome_exibicao = {n} WHERE id = {id}");'],
  ['Where/ToList em Obras', OBRAS_API, 'var obras = await _banco.Obras.Where(o => o.ArquivadaEm == null).ToListAsync(cancelamento);'],
  ['arquivo fora de server/src', 'src/lib/cpm.ts', 'x.ExecuteUpdateAsync(1) // UPDATE cronoai.obra'],
]

for (const [nome, arquivo, linha] of R18_ACUSA) {
  test(`backend R18 acusa: ${nome}`, () => {
    const achados = regrasBackend(arquivo, linha)
    assert.ok(achados.some((x) => x.id === 'R18'), `esperava R18 em: ${linha}`)
    // R18 bloqueia (sem severidade explícita = bloqueia)
    assert.ok(achados.filter((x) => x.id === 'R18').every((x) => x.severidade === undefined))
  })
}

for (const [nome, arquivo, linha] of R18_NAO_ACUSA) {
  test(`backend R18 não acusa: ${nome}`, () => {
    assert.deepEqual(regrasBackend(arquivo, linha).filter((x) => x.id === 'R18'), [])
  })
}

test('backend R18: o validar-regras trata R18 como bloqueio', () => {
  const novas = new Map([[OBRAS_API, [{ n: 7, texto: 'await _banco.Obras.ExecuteDeleteAsync();' }]]])

  const achados = aplicarRegras({ arquivos: [OBRAS_API], novas }).filter((x) => x.id === 'R18')

  assert.equal(achados.length, 1)
  assert.equal(achados[0].severidade, 'bloqueia')
  assert.equal(achados[0].linha, 7)
})

// ---------------------------------------------------------------------------------------------------------------
// R19 (alerta): migração que desliga ou afrouxa as garantias da trilha.
// ---------------------------------------------------------------------------------------------------------------
const R19_ACUSA = [
  ['DISABLE TRIGGER da trilha', 'migrationBuilder.Sql("ALTER TABLE cronoai.auditoria DISABLE TRIGGER trg_auditoria_append_only;");'],
  ['DISABLE TRIGGER citando só o nome do gatilho', 'migrationBuilder.Sql("DISABLE TRIGGER trg_auditoria_append_only");'],
  ['DROP TRIGGER da trilha', 'migrationBuilder.Sql("DROP TRIGGER trg_auditoria_append_only ON cronoai.auditoria;");'],
  ['DROP POLICY da trilha', 'migrationBuilder.Sql("DROP POLICY pol_auditoria_select ON cronoai.auditoria;");'],
  ['ALTER POLICY da trilha', 'migrationBuilder.Sql("ALTER POLICY pol_auditoria_insert ON cronoai.auditoria WITH CHECK (true);");'],
  ['GRANT UPDATE na trilha', 'migrationBuilder.Sql("GRANT UPDATE ON cronoai.auditoria TO cronoai_app;");'],
  ['NO FORCE na trilha', 'migrationBuilder.Sql("ALTER TABLE cronoai.auditoria NO FORCE ROW LEVEL SECURITY;");'],
  ['grant em minúsculas', 'migrationBuilder.Sql("grant delete on cronoai.auditoria to cronoai_app;");'],
]

const R19_NAO_ACUSA = [
  ['CREATE TRIGGER da criação', 'migrationBuilder.Sql("CREATE TRIGGER trg_auditoria_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON cronoai.auditoria FOR EACH STATEMENT EXECUTE FUNCTION cronoai.auditoria_recusa_alteracao();");'],
  ['ENABLE ALWAYS TRIGGER', 'migrationBuilder.Sql("ALTER TABLE cronoai.auditoria ENABLE ALWAYS TRIGGER trg_auditoria_append_only;");'],
  ['REVOKE da trilha', 'migrationBuilder.Sql("REVOKE UPDATE, DELETE, TRUNCATE ON cronoai.auditoria FROM cronoai_app;");'],
  ['DROP FUNCTION no Down', 'migrationBuilder.Sql("DROP FUNCTION IF EXISTS cronoai.auditoria_recusa_alteracao();");'],
  ['mesma sintaxe sobre obra (não é a trilha)', 'migrationBuilder.Sql("DROP TRIGGER trg_obra_versao ON cronoai.obra;");'],
  ['GRANT em tabela sem relação com a trilha', 'migrationBuilder.Sql("GRANT SELECT ON cronoai.obra TO cronoai_app;");'],
  ['comentário', '// aqui não se faz DROP POLICY pol_auditoria_select nem GRANT na auditoria'],
]

for (const [nome, linha] of R19_ACUSA) {
  test(`backend R19 acusa (alerta): ${nome}`, () => {
    const achados = regrasBackend(MIGRACAO_OBRAS, linha).filter((x) => x.id === 'R19')
    assert.equal(achados.length, 1, `esperava R19 em: ${linha}`)
    assert.equal(achados[0].severidade, 'alerta')
  })
}

for (const [nome, linha] of R19_NAO_ACUSA) {
  test(`backend R19 não acusa: ${nome}`, () => {
    assert.deepEqual(regrasBackend(MIGRACAO_OBRAS, linha).filter((x) => x.id === 'R19'), [])
  })
}

test('backend R19: a mesma linha fora de Migrations/ não é R19 (quem a acusa é a R15)', () => {
  const linha = 'cmd.CommandText = "ALTER TABLE cronoai.auditoria NO FORCE ROW LEVEL SECURITY";'

  const achados = regrasBackend('server/src/CronoAI.Api/Obras/ServicoObras.cs', linha)

  assert.deepEqual(achados.map((x) => x.id), ['R15'])
})

test('backend R19: no validar-regras é alerta, não bloqueio', () => {
  const linha = 'migrationBuilder.Sql("ALTER TABLE cronoai.auditoria DISABLE TRIGGER trg_auditoria_append_only;");'
  const novas = new Map([[MIGRACAO_OBRAS, [{ n: 3, texto: linha }]]])

  const achados = aplicarRegras({ arquivos: [MIGRACAO_OBRAS], novas }).filter((x) => x.id === 'R19')

  assert.equal(achados.length, 1)
  assert.equal(achados[0].severidade, 'alerta')
})

test('backend R18 e R19: a migração real do ciclo 00013 não aciona nenhuma das duas (arquivo versionado)', async () => {
  // Guarda de regressão da própria regra: o texto verdadeiro da migração, linha a linha.
  const { readFileSync } = await import('node:fs')
  const { raizRepo } = await import('./regras-cronoai.mjs')
  const texto = readFileSync(`${raizRepo()}/${MIGRACAO_OBRAS}`, 'utf8').split('\n')

  const achados = texto.flatMap((linha) => regrasBackend(MIGRACAO_OBRAS, linha)).filter((x) => x.id === 'R18' || x.id === 'R19')

  assert.deepEqual(achados, [])
})
