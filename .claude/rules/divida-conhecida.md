---
paths:
  - "src/**/*.ts"
  - "src/**/*.vue"
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/rules/divida-conhecida.md`) para o CronoAI em 25/10/2026.

# Dívida conhecida — imite a estrutura, nunca estes padrões

O código vizinho tem limitações vivas, listadas no `CLAUDE.md › Dívida conhecida` e nas specs. Imite **estrutura** (pastas, formato, nomes, forma dos testes); **não** amplie uma limitação abaixo nem a "conserte" de passagem — cada uma tem spec própria.

## Dívida registrada no CLAUDE.md

| Dívida | Onde aparece | Regra |
|---|---|---|
| Histórico da Curva S reconstruído linearmente | `computeSCurve`/`earnedShareAt` (`lib/evm.ts`) | não trate o histórico como medido; snapshots são a SPEC-04 |
| Premissas fixas no código | `lib/scenarios.ts` (`CONGESTION_FACTOR`, `MOBILIZATION_PER_WORKER`, `OVERTIME_PREMIUM`, `REWORK_CONTINGENCY`), `HOURLY_RATES` (`data/seed.ts`), `SAFETY_MARGIN_DAYS` (`lib/supplies.ts`), catálogo `data/sinapiCatalog.ts` | não acrescente constante nova sem marcar como ilustrativa; configurável por obra é a SPEC-03 (Inviolável 7) |
| CPM em dias inteiros, calendário único | `computeSchedule` (`Math.round(t.durationDays)`), `WorkCalendar` | não introduza frações de dia nem calendário por tarefa fora da SPEC-05 |
| `vitest` 3 (críticas) e `tailwindcss` 3 (moderadas) com aviso de vulnerabilidade (dev) | `package.json` | as correções exigem `vitest` 5 e Tailwind 4, cada uma num PR próprio; não misture |

## Aproximações e armadilhas observadas no código

| Situação | Onde | O que fazer |
|---|---|---|
| Lag em dias corridos convertido para úteis por 5/7 (aproximação) | `lagToWorkingDays` (`lib/msProjectXmlParser.ts`) | não propague o 5/7 para outro cálculo; lag `edays` exato é a SPEC-05 (RF-05.4) |
| Lag percentual (LagFormat 19/20) devolve `undefined` | `lagToWorkingDays` | o import precisa avisar o usuário; não descarte em silêncio |
| Export grava todo lag com `LagFormat` 7 (dias úteis) | `buildMspdiXml` | lag de outro formato importado não volta no formato original — conhecido, SPEC-06 (RF-06.3) |
| `safeDiv` devolve 1 com divisor zero (SPI/CPI = 1,00 com PV/AC = 0) | `lib/evm.ts` | não reuse para outra métrica sem decidir o fallback; não mostre como desempenho real |
| Custo real apropriado proporcionalmente ao avanço (fator 1,03 sem histórico) e arredondado a R$ inteiro | `progressPatch` (`stores/useProjectStore.ts`) | é estimativa (SPEC-10, RF-10.3); não trate como custo real nem copie o arredondamento |
| DLP usa dias **corridos** (`addCalendarDays`), o CPM usa dias **úteis** | `lib/supplies.ts` × `lib/cpm.ts` | não misture as unidades; declare qual usa em cálculo novo |
| Testes antigos com asserção só de direção (`toBeGreaterThan`) | `lib/*.test.ts` | não imite: cálculo novo fixa o número (`testes.md`) |
| `localStorage` indefinido no Node 26 | testes de store | `globalThis.localStorage?.clear?.()` no `beforeEach` |
| Horizonte do calendário de 1.600 dias úteis a partir da data-base | `WorkCalendar` | além dele, `dateAt` extrapola; obra longa precisa de teste próprio |

## Como consultar

```bash
node .claude/scripts/validar-regras.mjs --base {BASE}
```

## Achou dívida no arquivo que está mexendo

- **Dentro do escopo**: corrija, com teste que fixe o novo número (antes → depois no PR).
- **Fora do escopo**: não corrija de passagem. Registre no relatório (arquivo e linha) e siga.
