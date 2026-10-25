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
| Cálculo sem recurso, nivelamento nem vários caminhos críticos; cadastro de calendários e hora extra por frente | `cpm.ts`, `calendarioTrabalho.ts` | RF-05.2 por recurso, RF-05.6 e RF-05.7 não existem; calendários só se escolhem (criar é do 00005); não simule recurso nem nivelamento no motor |
| Tarefa agendada manualmente (`<Manual>1`) é calculada automaticamente | `parseMspdiXml`, `cpm.ts`, painel de divergências | a marca é preservada e o painel explica a divergência; fixar as datas da tarefa manual é ciclo próprio |
| PV ignora as exceções úteis do calendário (sábado de hora extra e dia útil extra do arquivo) | `evm.ts`, `store.calendariosPv` | separar hora extra de dia útil extra é do 00005; não "conserte" de passagem |
| Exceção recorrente sem lista legada e `WorkWeeks` só avisam; datas reais sem hora | `lerCalendarioMspdi` | expandir a recorrência pela regra e aplicar `WorkWeeks` ficam para depois |
| `vitest` 3 (críticas) e `tailwindcss` 3 (moderadas) com aviso de vulnerabilidade (dev) | `package.json` | as correções exigem `vitest` 5 e Tailwind 4, cada uma num PR próprio; não misture |

## Aproximações e armadilhas observadas no código

| Situação | Onde | O que fazer |
|---|---|---|
| Regras sem fonte oficial da Microsoft: lag entre calendários = o da sucessora (terceiros), semântica do `HonorConstraints` (os 134 arquivos do corpus gravam 0), exibição da folga de ALAP e `LinkLag` em % (percentual inteiro) | `calendarioDoLag` (`cpm.ts`), `lagDeMspdi`/`lagParaMspdi` | cada regra mora numa função; conferir no MS Project real (M-5/M-6) antes do piloto; não trate como validada |
| Marco com vínculo SS/FF mostra a data do último trecho útil antes do momento (o dia anterior ao início da predecessora, no SS +0): herdado do motor em dias e mantido para não mudar número | `cpm.ts` (data do marco) | não "conserte" de passagem; mudança de número exige teste antes → depois |
| `safeDiv` devolve 1 com divisor zero (SPI/CPI = 1,00 com PV/AC = 0) | `lib/evm.ts` | não reuse para outra métrica sem decidir o fallback; não mostre como desempenho real |
| Custo real apropriado proporcionalmente ao avanço (fator 1,03 sem histórico) e arredondado a R$ inteiro | `progressPatch` (`stores/useProjectStore.ts`) | é estimativa (SPEC-10, RF-10.3); não trate como custo real nem copie o arredondamento |
| DLP usa dias **corridos** (`addCalendarDays`), o CPM usa dias **úteis** | `lib/supplies.ts` × `lib/cpm.ts` | não misture as unidades; declare qual usa em cálculo novo |
| Testes antigos com asserção só de direção (`toBeGreaterThan`) | `lib/*.test.ts` | não imite: cálculo novo fixa o número (`testes.md`) |
| `localStorage` indefinido no Node 26 | testes de store | `globalThis.localStorage?.clear?.()` no `beforeEach` |
| Persistência só no navegador (IndexedDB, "best-effort": o navegador pode apagar dados sob falta de disco; duas abas na mesma obra, a última gravação vence; sem `navigator.storage.persist()`) | `stores/armazenamentoObras.ts` | não prometa durabilidade nem sincronização; o aviso de cota e a exportação para `.xml` são a rede de segurança até a SPEC-01 (backend); `persist()` fica para o ciclo dos snapshots |

## Como consultar

```bash
node .claude/scripts/validar-regras.mjs --base {BASE}
```

## Achou dívida no arquivo que está mexendo

- **Dentro do escopo**: corrija, com teste que fixe o novo número (antes → depois no PR).
- **Fora do escopo**: não corrija de passagem. Registre no relatório (arquivo e linha) e siga.
