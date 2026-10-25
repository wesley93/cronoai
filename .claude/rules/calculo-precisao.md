---
paths:
  - "src/lib/cpm.ts"
  - "src/lib/calendar.ts"
  - "src/lib/evm.ts"
  - "src/lib/scenarios.ts"
  - "src/lib/supplies.ts"
  - "src/lib/sinapi*.ts"
  - "src/lib/diagnosis.ts"
  - "src/stores/useProjectStore.ts"
---

> Criado para o CronoAI em 25/10/2026, no formato do processo SophIA.

# Cálculo — precisão dos números

Fonte da verdade: `CLAUDE.md` › **Convenções › TypeScript / lógica** e › **Invioláveis** (itens 1 e 7). Mexer aqui é **T1** (datas/rede) ou **T2** (financeiro/quantidades): faixa 2 no mínimo e o agente **`especialista-obra` é obrigatório** na validação (`prompts/14-especialista-obra.md`), em qualquer faixa.

## Antes de editar

1. Diga **qual número muda** e em quais telas aparece.
2. Escreva o **caso de referência**: entrada mínima → número esperado → fonte (MS Project, PMBOK, SINAPI <UF> <mês/ano>, planilha da obra). Sem fonte, pergunte.
3. Escreva o teste com o número explícito **antes** ou junto da mudança (`testes.md › Números`).

## Unidades e convenções

| Grandeza | Unidade no código | Cuidado |
|---|---|---|
| Data | string ISO `yyyy-mm-dd`, UTC | use `parseISO`/`toISO`/`addCalendarDays` de `calendar.ts`; dia da semana por `getUTCDay`, nunca `new Date(iso)` com hora local |
| Duração e lag (CPM) | **dias úteis inteiros** (até a SPEC-05 migrar para minutos) | índice de dia útil do `WorkCalendar`; `EF` é **exclusivo**: término = `dateAt(EF − 1)`; marco tem `EF = ES` |
| Lead time e margem (DLP) | **dias corridos** (`addCalendarDays`) | não misture com dias úteis; declare a unidade no comentário |
| Dinheiro | `number` em R$ | não arredonde no meio do cálculo; só na exibição (`format.ts`) |
| Percentual concluído | 0–100 | nunca 0–1 |
| Jornada | 8 h/dia (`HOURS_PER_DAY`); 480 min/dia no MSPDI | premissa da SPEC-03 |

## Fórmulas de referência (implementação atual)

**CPM** (`cpm.ts`) — passo de ida: FS `ES_s ≥ EF_p + lag`; SS `ES_s ≥ ES_p + lag`; FF `EF_s ≥ EF_p + lag`; SF `EF_s ≥ ES_p + lag`; SNET como limite inferior. Passo de volta pelas mesmas relações (`LS = LF − d`). Folga total = `LF − EF`; folga livre = menor folga até as sucessoras; crítica = folga total ≤ 0. Reprogramação pela data de status: não iniciada começa no dia útil seguinte à data de status; iniciada fica com `restante = ⌈dur × (1 − %/100)⌉` (mínimo 1); concluída usa as datas reais; sucessora já iniciada não restringe a predecessora. Meta: paridade com o MS Project, tolerância 0 dia útil (SPEC-05; `docs/specs/README.md › Definição de "preciso"`).

**Calendário** (`calendar.ts`) — seg–sex; feriados nacionais fixos e móveis pela Páscoa (Carnaval −48/−47, Sexta-feira Santa −2, Corpus Christi +60); `extraWorkingDays` (sábados de hora extra) viram dia útil.

**EVM** (`evm.ts`, PMBOK; só tarefas folha) — `PV = Σ BAC × fração planejada` (dias úteis decorridos da linha de base até a data de status, inclusive, ÷ dias úteis da linha de base); `EV = Σ BAC × %/100`; `AC = Σ custo real`; `SV = EV − PV`; `CV = EV − AC`; `SPI = EV/PV`; `CPI = EV/AC`; `EAC = BAC/CPI` (variantes `AC + (BAC − EV)` e `AC + (BAC − EV)/(CPI × SPI)`); `ETC = EAC − AC`; `VAC = BAC − EAC`; `TCPI = (BAC − EV)/(BAC − AC)`; término por SPI = duração planejada ÷ SPI. Meta do piloto: ±0,5% da planilha de controle (SPEC-10/13).

**DLP** (`supplies.ts`) — data necessária = início previsto da tarefa (ou o dia seguinte à data de status, se já iniciada ou atrasada); `DLP = necessária − (lead time + margem)`, em dias corridos.

**SINAPI** (`sinapi.ts`, `sinapiBudget.ts`) — `HH = quantidade × RUP`; `duração = HH ÷ (equipe × 8 h)`; dias no cronograma = `⌈duração⌉`, mínimo 1; `equipe = HH ÷ (dias × 8 h)`. Números pt-BR por `parseNumberBR`.

**Cenários** (`scenarios.ts`) — fatores, taxas e adicional de hora extra são **premissas ilustrativas** (Inviolável 7); hora extra, adicional e jornada exigem **RH + Jurídico** antes de virar regra. A recomendação de cenário é heurística de projeto, não norma.

**Diagnóstico** (`diagnosis.ts`) — texto determinístico: cada frase rastreável a um número calculado (SPEC-10, RF-10.7). Nada de número que não venha de `src/lib`.

**Store** (`useProjectStore.ts`) — derivados chamam `src/lib`; não reimplemente fórmula na store. `progressPatch` apropria custo real por estimativa (ver `divida-conhecida.md`).

## Regras

- Função pura; fórmula citada no comentário (`// SPI = EV ÷ PV`), com a fonte quando não for óbvia.
- Divisão por zero e entrada inválida tratadas de forma explícita: nada de `NaN`/`Infinity` no estado, na tela ou no XML. Fallback (ex.: `safeDiv`) declarado e testado.
- Mudança de convenção (unidade, arredondamento, inclusivo × exclusivo) é decisão: vai na ficha/plano e, se estrutural, em ADR (`/adr`).
- Número alterado: teste novo ou atualizado e o antes → depois no PR (Inviolável 1). Teste existente com valor mudado sem justificativa reprova.
- Performance (RNF-05.1: 3.000 tarefas/6.000 vínculos em < 500 ms) não justifica perder precisão.
