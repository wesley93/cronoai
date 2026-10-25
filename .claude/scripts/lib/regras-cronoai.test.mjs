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
