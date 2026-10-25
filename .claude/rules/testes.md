---
paths:
  - "src/**/*.test.ts"
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/rules/testes.md`) para o CronoAI em 25/10/2026.

# Testes (Vitest + jsdom)

Fonte da verdade: `CLAUDE.md` › **Convenções › Testes** e › **Invioláveis**. Atalho para o escopo afetado: `node .claude/scripts/testar-afetado.mjs --base {BASE}`.

## Onde e como

- Arquivos `*.test.ts` ao lado do código (`src/lib/*.test.ts`, `src/stores/*.test.ts`). Ambiente `jsdom` (`vite.config.ts`); `DOMParser` disponível para o MSPDI.
- Um arquivo: `npx vitest run src/lib/evm.test.ts`; um teste: `npx vitest run src/lib/evm.test.ts -t "nome"`; todos: `npm test`.
- Nomes de `describe`/`it` em português, descrevendo o comportamento (siga o vizinho: `core.test.ts`, `scenarios.test.ts`, `msProjectXmlParser.test.ts`).
- Base de dados: a obra de exemplo (`buildSeedState()`, Edifício Aurora) ou um caso mínimo montado no teste. Sempre dados fictícios.

## Números (Inviolável 1)

- Todo cálculo novo ou alterado em `src/lib` tem teste **fixando o valor**: `toBe(…)` para datas ISO, inteiros e strings; `toBeCloseTo(valor, casas)` para R$ e índices, com as casas declaradas.
- Asserção só de direção (`toBeGreaterThan`, `toBeTruthy`, "não lança") **não prova cálculo** — o `testes` marca `INCONCLUSIVE`. Use-a só como complemento de uma asserção exata.
- Cada número do **caso de referência** da ficha/plano vira uma asserção, com a fonte em comentário (`// MS Project: término 19/10 (5 d úteis a partir de 13/10)`).
- Teste existente com valor alterado: o antes → depois e o motivo vão no ciclo e no PR. Nunca ajuste a asserção só para passar.
- Bordas: marco (duração 0), concluída/iniciada na data de status, feriado e fim de semana, divisão por zero, lag negativo.

## MSPDI (Inviolável 2)

- Mudança no `msProjectXmlParser.ts`: teste de ida e volta (`buildMspdiXml` → `parseMspdiXml`) afirmando os campos tocados e `validateMspdi(xml, { strictOrder: true })` com `errors` igual a `[]`.
- XML de teste pequeno e fictício, montado no próprio teste ou em fixture versionada; arquivo real de obra nunca entra no repositório.

## Store

- `beforeEach`: `globalThis.localStorage?.clear?.()` e `setActivePinia(createPinia())` — o Node 26 pode expor `localStorage` indefinido.
- Mudança no formato do estado (T4): teste que grava um estado no formato anterior e confere que abre sem erro.

## Regras gerais

- Teste comportamento, não detalhe de implementação. Sem `setTimeout` para esperar; sem `it.skip`/`it.only` no commit (`skip` só com o motivo e quando sai).
- `vi.useFakeTimers()`/`vi.setSystemTime()` quando o código usa a data de hoje; sempre restaure.

## Antes de entregar

`npx vitest run` dos arquivos tocados, `npm run typecheck` e, antes do PR, `npm run ci` (o GitHub Actions roda os testes). Não há E2E ainda (SPEC-00, incremento 0.2).
