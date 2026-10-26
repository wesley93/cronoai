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
const MIGRACAO_OBRAS = 'server/src/CronoAI.Dados/Migrations/20261025201449_ObrasAuditoria.cs'

const R18_ACUSA = [
  ['ExecuteUpdateAsync em Api/Obras', OBRAS_API, 'await _banco.Obras.Where(o => o.Id == id).ExecuteUpdateAsync(s => s.SetProperty(o => o.Nome, "x"));'],
  ['ExecuteDelete em Dados/Auditoria', AUDITORIA_DADOS, 'db.Auditorias.Where(a => a.Id > 0).ExecuteDelete();'],
  ['ExecuteDeleteAsync em qualquer lugar de src', 'server/src/CronoAI.Api/Empresas/EmpresasEndpoints.cs', 'await db.Membros.ExecuteDeleteAsync(cancelamento);'],
  ['ExecuteSqlAsync de UPDATE em cronoai.obra', OBRAS_API, 'await db.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET nome = {nome} WHERE id = {id}");'],
  ['ExecuteSql de DELETE em cronoai.auditoria', AUDITORIA_DADOS, 'db.Database.ExecuteSql($"DELETE FROM cronoai.auditoria WHERE id = {id}");'],
  ['SqlQuery de INSERT em cronoai.auditoria', AUDITORIA_DADOS, 'db.Database.SqlQuery<int>($"INSERT INTO cronoai.auditoria (id) VALUES ({id}) RETURNING id");'],
  ['FromSql de UPDATE em cronoai.obra', OBRAS_API, 'db.Obras.FromSql($"UPDATE cronoai.obra SET nome = {x} RETURNING *");'],
  // R-1 (rodada 02): a PRÓPRIA linha do SQL é acusada, sem exigir a chamada na mesma linha
  ['SQL na linha seguinte à chamada (2ª linha)', OBRAS_API, '    $"UPDATE cronoai.obra SET nome = {nome} WHERE id = {id}");'],
  ['bloco de texto bruto: DELETE na linha do bloco', AUDITORIA_DADOS, '    DELETE FROM cronoai.auditoria WHERE id = {id}'],
  ['bloco de texto bruto: INSERT na linha do bloco', AUDITORIA_DADOS, '    INSERT INTO cronoai.auditoria (empresa_id) VALUES ({e})'],
  ['tabela sem schema (search_path é cronoai)', OBRAS_API, '    $"UPDATE obra SET nome = {nome} WHERE id = {id}"'],
  ['INSERT sem schema', AUDITORIA_DADOS, 'await db.Database.ExecuteSqlAsync($"INSERT INTO auditoria (id) VALUES ({id})");'],
  ['ExecuteSqlInterpolatedAsync', OBRAS_API, 'await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE cronoai.obra SET nome = {n}");'],
  ['identificadores entre aspas', OBRAS_API, '    $"UPDATE "cronoai"."obra" SET nome = {n}"'],
  ['aspas só na tabela', OBRAS_API, '    $"DELETE FROM cronoai."auditoria""'],
  ['ONLY com schema', AUDITORIA_DADOS, '    DELETE FROM ONLY cronoai.auditoria'],
  ['UPDATE ONLY sem schema', OBRAS_API, '    UPDATE ONLY obra SET nome = {n}'],
  ['espaços em volta do ponto', OBRAS_API, '    UPDATE cronoai . obra SET nome = {n}'],
  ['minúsculas', OBRAS_API, '    update cronoai.obra set nome = {n}'],
  ['MERGE INTO com schema', OBRAS_API, '    MERGE INTO cronoai.obra o USING origem x ON o.id = x.id'],
  ['MERGE INTO sem schema', AUDITORIA_DADOS, '    MERGE INTO auditoria a USING origem x ON a.id = x.id'],
  ['aspas escapadas em string C# (barra e aspas)', OBRAS_API, '    $"UPDATE \\"cronoai\\".\\"obra\\" SET nome = {n}"'],
  ['aspas escapadas só na auditoria', AUDITORIA_DADOS, '    $"DELETE FROM cronoai.\\"auditoria\\""'],
  ['aspas dobradas em string verbatim', OBRAS_API, '    $@"UPDATE ""cronoai"".""obra"" SET nome = {n}"'],
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
  ['SELECT sem schema em obra', OBRAS_API, '    SELECT id FROM obra WHERE id = {id}'],
  ['nome parecido: obra_arquivada', OBRAS_API, '    UPDATE obra_arquivada SET x = 1'],
  ['nome parecido: obras', OBRAS_API, '    UPDATE obras SET x = 1'],
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
  ['DISABLE ROW LEVEL SECURITY', 'migrationBuilder.Sql("ALTER TABLE cronoai.auditoria DISABLE ROW LEVEL SECURITY;");'],
  ['CREATE POLICY na trilha', 'migrationBuilder.Sql("CREATE POLICY pol_x ON cronoai.auditoria FOR UPDATE TO cronoai_app USING (true);");'],
  ['ENABLE TRIGGER sem ALWAYS', 'migrationBuilder.Sql("ALTER TABLE cronoai.auditoria ENABLE TRIGGER trg_auditoria_append_only;");'],
  ['ENABLE REPLICA TRIGGER', 'migrationBuilder.Sql("ALTER TABLE cronoai.auditoria ENABLE REPLICA TRIGGER trg_auditoria_append_only;");'],
  ['CASCADE', 'migrationBuilder.Sql("DROP TABLE cronoai.auditoria CASCADE;");'],
  ['CREATE OR REPLACE FUNCTION da trilha', '    CREATE OR REPLACE FUNCTION cronoai.auditoria_recusa_alteracao() RETURNS trigger'],
  ['OWNER TO', 'migrationBuilder.Sql("ALTER TABLE cronoai.auditoria OWNER TO outro_papel;");'],
  ['grant em minúsculas', 'migrationBuilder.Sql("grant delete on cronoai.auditoria to cronoai_app;");'],
]

const R19_NAO_ACUSA = [
  ['CREATE TRIGGER da criação', 'migrationBuilder.Sql("CREATE TRIGGER trg_auditoria_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON cronoai.auditoria FOR EACH STATEMENT EXECUTE FUNCTION cronoai.auditoria_recusa_alteracao();");'],
  ['CREATE FUNCTION (sem OR REPLACE) da criação', '    CREATE FUNCTION cronoai.auditoria_recusa_alteracao() RETURNS trigger'],
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

test('backend R18 e R19: a migração real do ciclo 00013 não aciona a R18 e só alerta nas 2 criações de política da trilha pelo helper (arquivo versionado)', async () => {
  // Guarda de regressão da própria regra: o texto verdadeiro da migração, linha a linha. Desde o ciclo 00014 a R19 também enxerga o
  // helper: criar a política de SELECT e a de INSERT da trilha (a criação LEGÍTIMA do 00013) é alerta para revisão humana, e só isso.
  const { readFileSync } = await import('node:fs')
  const { raizRepo } = await import('./regras-cronoai.mjs')
  const texto = readFileSync(`${raizRepo()}/${MIGRACAO_OBRAS}`, 'utf8').split('\n')

  const achados = texto.flatMap((linha) => regrasBackend(MIGRACAO_OBRAS, linha)).filter((x) => x.id === 'R18' || x.id === 'R19')

  assert.equal(achados.filter((x) => x.id === 'R18').length, 0)
  assert.equal(achados.length, 2)
  assert.ok(achados.every((x) => x.id === 'R19' && x.severidade === 'alerta'))
})

// ---------------------------------------------------------------------------------------------------------------
// R19 por instrução: o SQL da migração pode ocupar várias linhas (R-2 da rodada 02).
// ---------------------------------------------------------------------------------------------------------------
import { r19PorInstrucao } from './regras-cronoai.mjs'

const lin = (...textos) => textos.map((texto, i) => ({ n: 10 + i, texto }))

test('backend R19 por instrução: DISABLE TRIGGER partido em linhas é acusado na linha em que a instrução começa', () => {
  const achados = r19PorInstrucao(MIGRACAO_OBRAS, lin(
    'migrationBuilder.Sql(',
    '    "ALTER TABLE cronoai.auditoria "',
    '    + "DISABLE TRIGGER trg_x;");',
  ))

  assert.deepEqual(achados, [{ n: 10 }])
})

test('backend R19 por instrução: bloco de texto bruto com a palavra numa linha e a tabela noutra', () => {
  const achados = r19PorInstrucao(MIGRACAO_OBRAS, lin(
    'migrationBuilder.Sql(',
    '    """',
    '    ALTER TABLE cronoai.auditoria',
    '    DISABLE ROW LEVEL SECURITY;',
    '    """);',
  ))

  assert.equal(achados.length, 1)
})

test('backend R19 por instrução: instrução inofensiva em várias linhas não é acusada', () => {
  const achados = r19PorInstrucao(MIGRACAO_OBRAS, lin(
    'migrationBuilder.Sql(',
    '    "REVOKE UPDATE, DELETE, TRUNCATE ON cronoai.auditoria "',
    '    + "FROM cronoai_app;");',
  ))

  assert.deepEqual(achados, [])
})

test('backend R19 por instrução: linha única já acusada pela regra por linha não é duplicada; fora de Migrations/ não vale', () => {
  assert.deepEqual(r19PorInstrucao(MIGRACAO_OBRAS, lin('migrationBuilder.Sql("ALTER TABLE cronoai.auditoria DISABLE ROW LEVEL SECURITY;");')), [])
  assert.deepEqual(r19PorInstrucao('server/src/CronoAI.Api/Obras/ServicoObras.cs', lin('x = "auditoria"', '  + " DISABLE TRIGGER x;"')), [])
})

test('backend R19 por instrução: no validar-regras a instrução em várias linhas é alerta', () => {
  const novas = new Map([[MIGRACAO_OBRAS, lin('migrationBuilder.Sql(', '    "ALTER TABLE cronoai.auditoria "', '    + "OWNER TO outro;");')]])

  const achados = aplicarRegras({ arquivos: [MIGRACAO_OBRAS], novas }).filter((x) => x.id === 'R19')

  assert.equal(achados.length, 1)
  assert.equal(achados[0].severidade, 'alerta')
  assert.equal(achados[0].linha, 10)
})

test('backend R19 por instrução: a migração real do ciclo 00013 não aciona (regra por linha nem por instrução)', async () => {
  const { readFileSync } = await import('node:fs')
  const { raizRepo } = await import('./regras-cronoai.mjs')
  const linhas = readFileSync(`${raizRepo()}/${MIGRACAO_OBRAS}`, 'utf8').split('\n').map((texto, i) => ({ n: i + 1, texto }))

  // Por instrução: nada. Por linha: só as 2 criações de política da trilha pelo helper (R19 ampliada no ciclo 00014).
  assert.deepEqual(r19PorInstrucao(MIGRACAO_OBRAS, linhas), [])
  assert.equal(linhas.flatMap((l) => regrasBackend(MIGRACAO_OBRAS, l.texto)).filter((x) => x.id === 'R19').length, 2)
})

// ---------------------------------------------------------------------------------------------------------------
// R18 ampliada (ciclo 00014, T78): as tabelas de perfis e vínculos também são auditadas e o app não escreve nelas por SQL.
// ---------------------------------------------------------------------------------------------------------------
const MEMBROS_API = 'server/src/CronoAI.Api/Membros/ServicoMembros.cs'
const PROVISIONAMENTO = 'server/src/CronoAI.Dados/Rls/ProvisionamentoEmpresa.cs'
const MIGRACAO_PERFIS = 'server/src/CronoAI.Dados/Migrations/20261025233436_PerfisPermissoes.cs'

const R18_NOVAS_ACUSA = [
  ['INSERT INTO cronoai.membro_empresa', MEMBROS_API, '    INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id) VALUES ({e}, {u})'],
  ['UPDATE entre aspas em acesso_obra', MEMBROS_API, '    $"UPDATE "acesso_obra" SET obra_id = {o}"'],
  ['DELETE FROM ONLY cronoai.frente', MEMBROS_API, '    DELETE FROM ONLY cronoai.frente WHERE id = {id}'],
  ['MERGE INTO carteira_obra', MEMBROS_API, '    MERGE INTO carteira_obra c USING origem x ON c.id = x.id'],
  ['aspas escapadas em acesso_carteira', MEMBROS_API, '    $"DELETE FROM \\"cronoai\\".\\"acesso_carteira\\""'],
  ['SQL na linha seguinte à chamada', MEMBROS_API, '    $"UPDATE cronoai.acesso_frente SET frente_id = {f}");'],
  ['UPDATE cronoai.carteira sem schema nas aspas', MEMBROS_API, '    update carteira set nome = {n}'],
]

const R18_NOVAS_NAO_ACUSA = [
  ['o provisionamento de desenvolvimento (única exceção)', PROVISIONAMENTO, '    INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id) VALUES ({e}, {u})'],
  ['migração', MIGRACAO_PERFIS, 'migrationBuilder.Sql("UPDATE cronoai.membro_empresa SET perfil = \'administrador\' WHERE perfil IS NULL");'],
  ['SELECT em membro_empresa', MEMBROS_API, '    SELECT 1 FROM cronoai.membro_empresa m WHERE m.usuario_id = {u}'],
  ['comentário', MEMBROS_API, '// INSERT INTO cronoai.membro_empresa só pelo provisionamento'],
  ['teste fica de fora', 'server/tests/CronoAI.Api.Testes/Dados/MembroTestes.cs', 'INSERT INTO cronoai.membro_empresa (empresa_id) VALUES (1)'],
  ['nome parecido: carteira_arquivada', MEMBROS_API, '    UPDATE carteira_arquivada SET x = 1'],
  ['nome parecido: frentes', MEMBROS_API, '    DELETE FROM frentes'],
]

for (const [nome, arquivo, linha] of R18_NOVAS_ACUSA) {
  test(`backend R18 ampliada acusa: ${nome}`, () => {
    const achados = regrasBackend(arquivo, linha)
    assert.ok(achados.some((x) => x.id === 'R18'), `esperava R18 em: ${linha}`)
  })
}

for (const [nome, arquivo, linha] of R18_NOVAS_NAO_ACUSA) {
  test(`backend R18 ampliada não acusa: ${nome}`, () => {
    assert.deepEqual(regrasBackend(arquivo, linha).filter((x) => x.id === 'R18'), [])
  })
}

test('backend R18 ampliada: só o provisionamento é perdoado (outro arquivo de Rls/ com a mesma linha é acusado)', () => {
  const linha = '    INSERT INTO cronoai.membro_empresa (empresa_id) VALUES ({e})'

  assert.deepEqual(regrasBackend('server/src/CronoAI.Dados/Rls/Outro.cs', linha).filter((x) => x.id === 'R18').length, 1)
  assert.deepEqual(regrasBackend(PROVISIONAMENTO, linha).filter((x) => x.id === 'R18'), [])
})

test('backend R18 ampliada: o provisionamento real do ciclo 00014 não aciona a R18 (arquivo versionado)', async () => {
  const { readFileSync } = await import('node:fs')
  const { raizRepo } = await import('./regras-cronoai.mjs')
  const texto = readFileSync(`${raizRepo()}/${PROVISIONAMENTO}`, 'utf8').split('\n')

  assert.deepEqual(texto.flatMap((linha) => regrasBackend(PROVISIONAMENTO, linha)).filter((x) => x.id === 'R18'), [])
})

// ---------------------------------------------------------------------------------------------------------------
// R19 ampliada (ciclo 00014, T79): os helpers de política escondem o SQL; citar a trilha neles em migração é alerta.
// ---------------------------------------------------------------------------------------------------------------
const R19_HELPER_ACUSA = [
  ['PoliticaUpdate da trilha', 'migrationBuilder.PoliticaUpdate("auditoria", "pol_x", "true", "true");'],
  ['PoliticaDelete da trilha', 'migrationBuilder.PoliticaDelete("auditoria", "pol_x", "true");'],
  ['SubstituirPoliticaSelect da trilha', 'migrationBuilder.SubstituirPoliticaSelect("auditoria", "pol_auditoria_select", usando);'],
  ['SubstituirPoliticaInsert da trilha', 'migrationBuilder.SubstituirPoliticaInsert("auditoria", "pol_auditoria_insert", comCheck);'],
  ['RemoverPolitica da trilha', 'migrationBuilder.RemoverPolitica("auditoria", "pol_auditoria_select");'],
  ['com espaço antes da aspa', 'migrationBuilder.SubstituirPoliticaSelect( "auditoria", "pol_auditoria_select", usando);'],
  ['PoliticaSelect da trilha (criação)', 'migrationBuilder.PoliticaSelect("auditoria", "pol_auditoria_select", $"empresa_id = {e}");'],
]

const R19_HELPER_NAO_ACUSA = [
  ['PoliticaSelect de obra', 'migrationBuilder.PoliticaSelect("obra", "pol_obra_select", usando);'],
  ['SubstituirPoliticaUpdate de obra', 'migrationBuilder.SubstituirPoliticaUpdate("obra", "pol_obra_update", usando, comCheck);'],
  ['RemoverPolitica de membro_empresa', 'migrationBuilder.RemoverPolitica("membro_empresa", "pol_membro_empresa_insert");'],
  ['comentário', '// SubstituirPoliticaSelect("auditoria", ...) só com revisão'],
]

for (const [nome, linha] of R19_HELPER_ACUSA) {
  test(`backend R19 ampliada acusa (alerta): ${nome}`, () => {
    const achados = regrasBackend(MIGRACAO_PERFIS, linha).filter((x) => x.id === 'R19')
    assert.equal(achados.length, 1, `esperava R19 em: ${linha}`)
    assert.equal(achados[0].severidade, 'alerta')
  })
}

for (const [nome, linha] of R19_HELPER_NAO_ACUSA) {
  test(`backend R19 ampliada não acusa: ${nome}`, () => {
    assert.deepEqual(regrasBackend(MIGRACAO_PERFIS, linha).filter((x) => x.id === 'R19'), [])
  })
}

test('backend R19 ampliada: a mesma linha fora de Migrations/ não é R19', () => {
  const linha = 'migrationBuilder.SubstituirPoliticaSelect("auditoria", "pol_auditoria_select", usando);'

  assert.deepEqual(regrasBackend('server/src/CronoAI.Dados/Rls/Exemplo.cs', linha).filter((x) => x.id === 'R19'), [])
})

test('backend R19 ampliada: a migração PerfisPermissoes real alerta (conferido: três camadas intactas) e a R18 não a acusa', async () => {
  // Esperado e conferido por humano no ciclo 00014: a migração substitui as políticas de SELECT e INSERT da trilha. Quem prova que
  // as três camadas do append-only seguem de pé é o teste de banco (Auditoria_por_visibilidade e o bloco de conferência da migração).
  const { readFileSync } = await import('node:fs')
  const { raizRepo } = await import('./regras-cronoai.mjs')
  const linhas = readFileSync(`${raizRepo()}/${MIGRACAO_PERFIS}`, 'utf8').split('\n')
  const achados = linhas.flatMap((linha) => regrasBackend(MIGRACAO_PERFIS, linha))

  assert.ok(achados.filter((x) => x.id === 'R19').length >= 2)
  assert.deepEqual(achados.filter((x) => x.id === 'R18'), [])
})

// ---------------------------------------------------------------------------------------------------------------
// R-1 da rodada 02 do ciclo 00014: helper e CHECK da trilha com "auditoria" na linha seguinte.
// ---------------------------------------------------------------------------------------------------------------
test('backend R19 por instrução: helper da trilha com a tabela na linha seguinte é acusado na linha em que a chamada começa', () => {
  const achados = r19PorInstrucao(MIGRACAO_PERFIS, lin(
    'migrationBuilder.SubstituirPoliticaSelect(',
    '    "auditoria",',
    '    "pol_auditoria_select",',
    '    $"empresa_id = {e}");',
  ))

  assert.deepEqual(achados, [{ n: 10 }])
})

test('backend R19 por instrução: RemoverPolitica e PoliticaDelete da trilha em várias linhas também são acusados', () => {
  assert.equal(r19PorInstrucao(MIGRACAO_PERFIS, lin('migrationBuilder.RemoverPolitica(', '    "auditoria", "pol_x");')).length, 1)
  assert.equal(r19PorInstrucao(MIGRACAO_PERFIS, lin('migrationBuilder.PoliticaDelete(', '    "auditoria",', '    "pol_x", "true");')).length, 1)
})

test('backend R19 por instrução: helper de outra tabela em várias linhas não é acusado', () => {
  assert.deepEqual(r19PorInstrucao(MIGRACAO_PERFIS, lin('migrationBuilder.SubstituirPoliticaSelect(', '    "obra",', '    "pol_obra_select", usando);')), [])
})

test('backend R19: DROP/ADD da CHECK da trilha é acusado em uma linha e em várias', () => {
  const umaLinha = 'migrationBuilder.AddCheckConstraint(name: "ck_auditoria_acao", schema: "cronoai", table: "auditoria", sql: "acao IN (1)");'
  assert.equal(regrasBackend(MIGRACAO_PERFIS, umaLinha).filter((x) => x.id === 'R19').length, 1)

  const achados = r19PorInstrucao(MIGRACAO_PERFIS, lin(
    'migrationBuilder.DropCheckConstraint(',
    '    name: "ck_auditoria_acao",',
    '    schema: "cronoai",',
    '    table: "auditoria");',
  ))
  assert.deepEqual(achados, [{ n: 10 }])
})

test('backend R19: CHECK de outra tabela não é acusada', () => {
  assert.deepEqual(r19PorInstrucao(MIGRACAO_PERFIS, lin('migrationBuilder.DropCheckConstraint(', '    name: "ck_obra_x",', '    table: "obra");')), [])
})

test('backend R19 por instrução: a migração PerfisPermissoes real alerta no Up (helpers e CHECK) e isso é esperado e conferido', async () => {
  // Esperado e conferido por humano (ciclo 00014): o Up substitui as políticas de SELECT/INSERT da trilha e troca a CHECK de ação
  // (acrescenta "remover"). O Down restaura. As três camadas do append-only são provadas por testes de banco e pelo bloco DO.
  const { readFileSync } = await import('node:fs')
  const { raizRepo } = await import('./regras-cronoai.mjs')
  const linhas = readFileSync(`${raizRepo()}/${MIGRACAO_PERFIS}`, 'utf8').split('\n').map((texto, i) => ({ n: i + 1, texto }))

  const porInstrucao = r19PorInstrucao(MIGRACAO_PERFIS, linhas)

  // Por instrução (várias linhas): Up = 2 helpers (SELECT, INSERT) + DROP e ADD da CHECK; Down = DROP e ADD da CHECK. Por linha (já
  // existia): as 2 restaurações de política do Down. Total no validar-regras: 8 alertas, todos esperados e conferidos.
  assert.equal(porInstrucao.length, 6, `esperava 6 alertas por instrução, veio ${porInstrucao.map((x) => x.n)}`)
  assert.deepEqual(porInstrucao.map((x) => x.n).filter((n) => n < 600).length, 4)
  assert.equal(linhas.flatMap((l) => regrasBackend(MIGRACAO_PERFIS, l.texto)).filter((x) => x.id === 'R19').length, 2)
})
