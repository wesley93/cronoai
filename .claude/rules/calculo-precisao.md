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
| Duração, lag e folga (CPM) | **minutos inteiros** (`duracaoMin`, `lag.minutos`, `folgaTotalMin`); lag % em percentual (ADR 00003) | o motor usa **momentos** (minutos de relógio desde 00:00 da data-base) e converte momento ↔ minuto útil em `calendarioTrabalho.ts`; `× 480` só lá; arredondar só nas fronteiras de conversão, para o minuto mais próximo, meio para cima |
| Data-hora de restrição e prazo | `yyyy-mm-dd` (início do expediente nas de início, fim do expediente nas de término e no prazo) ou `yyyy-mm-ddThh:mm`, **sem fuso** | a hora local da obra, como o MSPDI; datas reais, status e linha de base continuam `yyyy-mm-dd` |
| Lead time e margem (DLP) | **dias corridos** (`addCalendarDays`) | não misture com dias úteis; declare a unidade no comentário |
| Dinheiro | `number` em R$ | não arredonde no meio do cálculo; só na exibição (`format.ts`) |
| Percentual concluído | 0–100 | nunca 0–1 |
| Jornada | 8 h/dia (`HOURS_PER_DAY`); 480 min/dia no MSPDI | premissa da SPEC-03 |

## Fórmulas de referência (implementação atual)

**CPM** (`cpm.ts`, em minutos) — passo de ida: FS `ES_s ≥ EF_p + lag`; SS `ES_s ≥ ES_p + lag`; FF `EF_s ≥ EF_p + lag`; SF `EF_s ≥ ES_p + lag`, com o lag somado em minutos úteis. Passo de volta pelas mesmas relações (`LS = LF − d`). Folga total = `LF − EF` em minutos úteis do calendário da tarefa; folga livre = menor folga até as sucessoras (sem sucessora, até o fim do projeto); crítica = folga total ≤ 0. **Normalização:** início de tarefa com duração vai para o próximo momento útil do calendário dela; término fica no fim do último trecho útil (17:00, não 08:00 do dia seguinte); somar lag 0 **não** normaliza (o marco fica no término da predecessora). **Marco** (duração 0): a data cedo é a do próprio momento (`marcoDe`). A data tardia tem dois casos: quando o término tardio é o próprio momento do marco (`lf === s`: folga 0 sem sucessora, ou restrição de início), vale a data cedo; quando vem do início tardio da sucessora (ex.: seg 08:00), é o fim do trecho útil anterior (sex 17:00), como na volta do MS Project. **00:00 em ponto** num calendário de 24 h é o fim do dia anterior: término de tarefa ou marco nesse instante é exibido como "24:00" do dia anterior (`horaDeTermino`); exceção: momento antes do primeiro tempo útil do projeto.
- **Lag útil** conta no calendário da **sucessora** (do projeto quando ela não tem calendário próprio) — gate P1, fonte de terceiros (Boyle 2018, Trajkovski 2013), sem documentação oficial; validação final no MS Project real. Lag **corrido** (`edays`): minutos de relógio (24 h/dia), depois o início é normalizado no calendário da sucessora. Lag **%**: `round(% × duração da predecessora ÷ 100)` minutos, útil no calendário do lag. Duração corrida: calendário interno de 24 h, folga medida em 24 h e exibida em dias corridos ("dc").
- **Restrições** (honrar sempre, gate P2): SNET e FNET são limite inferior na ida; SNLT, FNLT, MSO e MFO prevalecem sobre o vínculo (folga negativa na predecessora; `restricaoConflito`) e limitam a volta; ALAP vai para as datas tardias depois da volta, sem mudar as datas cedo nem as folgas. **Prazo final** não move a tarefa: `LF = min(LF, prazo)` e `prazoFinalPerdido` quando o término passa dele.
- **Progresso** (forecast): não iniciada começa no 1º momento útil depois da data de status (se `moverRestante`); iniciada fica com `restante = round(duração × (1 − %/100))` minutos, meio para cima, mínimo 1 min; concluída usa as datas reais. **Lógica retida** (padrão): o restante da iniciada fora de sequência começa depois da predecessora e **restringe a predecessora** na volta; **substituir**: o progresso ignora o vínculo e a sucessora iniciada não restringe a predecessora. `moverRestante` é política do CronoAI, não o padrão do MS Project. Com `moverRestante = false` o restante da iniciada não é empurrado para depois da data de status: ele continua a parte já feita (início real + parte concluída, `somarUteis(início, duração − restante)`) e só é adiado por vínculo (lógica retida); a não iniciada fica na data que o cálculo dá, sem o empurrão. A opção vem do arquivo (`SplitsInProgressTasks`/`Move*`) ou da tela de dados da obra e é gravada em `meta.opcoesCronograma`. Meta: paridade com o MS Project, tolerância 0 dia útil (SPEC-05; `docs/specs/README.md › Definição de "preciso"`).

**Calendário** (`calendarioTrabalho.ts`) — semana por intervalo de horário (até 5 por dia), exceções com horário e calendário por tarefa; horizonte dinâmico com teto de 50 anos (acima, erro em português). O calendário padrão migrado é seg–sex 08:00–12:00 e 13:00–17:00; feriados nacionais fixos e móveis pela Páscoa (`calendar.ts`: Carnaval −48/−47, Sexta-feira Santa −2, Corpus Christi +60) são exceções não úteis; hora extra (sábado) é exceção útil. `WorkCalendar` segue para contas por dia ("+16 d.u.") e é derivado do calendário padrão.

**EVM** (`evm.ts`, PMBOK; só tarefas folha) — `PV = Σ BAC × fração planejada` (minutos úteis do **calendário da tarefa, sem as exceções úteis**, decorridos da linha de base até o fim do dia da data de status ÷ minutos úteis da linha de base); `EV = Σ BAC × %/100`; `AC = Σ custo real`; `SV = EV − PV`; `CV = EV − AC`; `SPI = EV/PV`; `CPI = EV/AC`; `EAC = BAC/CPI` (variantes `AC + (BAC − EV)` e `AC + (BAC − EV)/(CPI × SPI)`); `ETC = EAC − AC`; `VAC = BAC − EAC`; `TCPI = (BAC − EV)/(BAC − AC)`; término por SPI = duração planejada ÷ SPI. Meta do piloto: ±0,5% da planilha de controle (SPEC-10/13).

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
