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
