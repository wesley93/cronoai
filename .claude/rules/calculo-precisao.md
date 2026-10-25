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
| Dinheiro | `number` em R$ | não arredonde no meio do cálculo; só na exibição (`format.ts`: `arredondarBancario`, meio para o par, ex.: 0,125 → 0,12 e 2,675 → 2,68; regra a validar com Orçamento/Custos) |
| Percentual concluído | 0–100 | nunca 0–1 |
| Jornada | 8 h/dia (`HOURS_PER_DAY` na SINAPI); no custo do crashing, `minutosPorDia ÷ 60` (480 → 8 h); no custo da hora extra, os minutos úteis do sábado no calendário da frente ÷ 60; 480 min/dia no MSPDI | a jornada vem do calendário padrão; não há campo de jornada nas premissas |

## Fórmulas de referência (implementação atual)

**CPM** (`cpm.ts`, em minutos) — passo de ida: FS `ES_s ≥ EF_p + lag`; SS `ES_s ≥ ES_p + lag`; FF `EF_s ≥ EF_p + lag`; SF `EF_s ≥ ES_p + lag`, com o lag somado em minutos úteis. Passo de volta pelas mesmas relações (`LS = LF − d`). Folga total = `LF − EF` em minutos úteis do calendário da tarefa; folga livre = menor folga até as sucessoras (sem sucessora, até o fim do projeto); crítica = folga total ≤ 0. **Normalização:** início de tarefa com duração vai para o próximo momento útil do calendário dela; término fica no fim do último trecho útil (17:00, não 08:00 do dia seguinte); somar lag 0 **não** normaliza (o marco fica no término da predecessora). **Marco** (duração 0): a data cedo é a do próprio momento (`marcoDe`). A data tardia tem dois casos: quando o término tardio é o próprio momento do marco (`lf === s`: folga 0 sem sucessora, ou restrição de início), vale a data cedo; quando vem do início tardio da sucessora (ex.: seg 08:00), é o fim do trecho útil anterior (sex 17:00), como na volta do MS Project. **00:00 em ponto** num calendário de 24 h é o fim do dia anterior: término de tarefa ou marco nesse instante é exibido como "24:00" do dia anterior (`horaDeTermino`); exceção: momento antes do primeiro tempo útil do projeto.
- **Lag útil** conta no calendário da **sucessora** (do projeto quando ela não tem calendário próprio) — gate P1, fonte de terceiros (Boyle 2018, Trajkovski 2013), sem documentação oficial; validação final no MS Project real. Lag **corrido** (`edays`): minutos de relógio (24 h/dia), depois o início é normalizado no calendário da sucessora. Lag **%**: `round(% × duração da predecessora ÷ 100)` minutos, útil no calendário do lag. Duração corrida: calendário interno de 24 h, folga medida em 24 h e exibida em dias corridos ("dc").
- **Restrições** (honrar sempre, gate P2): SNET e FNET são limite inferior na ida; SNLT, FNLT, MSO e MFO prevalecem sobre o vínculo (folga negativa na predecessora; `restricaoConflito`) e limitam a volta; ALAP vai para as datas tardias depois da volta, sem mudar as datas cedo nem as folgas. **Prazo final** não move a tarefa: `LF = min(LF, prazo)` e `prazoFinalPerdido` quando o término passa dele.
- **Progresso** (forecast): não iniciada começa no 1º momento útil depois da data de status (se `moverRestante`); iniciada fica com `restante = round(duração × (1 − %/100))` minutos, meio para cima, mínimo 1 min; concluída usa as datas reais. **Lógica retida** (padrão): o restante da iniciada fora de sequência começa depois da predecessora e **restringe a predecessora** na volta; **substituir**: o progresso ignora o vínculo e a sucessora iniciada não restringe a predecessora. `moverRestante` é política do CronoAI, não o padrão do MS Project. Com `moverRestante = false` o restante da iniciada não é empurrado para depois da data de status: ele continua a parte já feita (início real + parte concluída, `somarUteis(início, duração − restante)`) e só é adiado por vínculo (lógica retida); a não iniciada fica na data que o cálculo dá, sem o empurrão. A opção vem do arquivo (`SplitsInProgressTasks`/`Move*`) ou da tela de dados da obra e é gravada em `meta.opcoesCronograma`. Meta: paridade com o MS Project, tolerância 0 dia útil (SPEC-05; `docs/specs/README.md › Definição de "preciso"`).

**Calendário** (`calendarioTrabalho.ts`) — semana por intervalo de horário (até 5 por dia; fim 00:00 vale 24:00 e `00:00–00:00` é o dia inteiro), exceções com horário e descrição, calendários alternativos criados na tela (até 100, nome único) e calendário por tarefa; horizonte dinâmico com teto de 50 anos (acima, erro em português). O calendário padrão é seg–sex 08:00–12:00 e 13:00–17:00. **Calendário efetivo = semana → feriados da obra (só se `aplicaFeriadosObra`) → exceções próprias do calendário (prevalecem sobre os feriados).** Feriados da obra (`feriadosObra.ts`, gerados por ano, sem lista fechada): nacionais (`calendar.ts`: fixos + Sexta-feira Santa Páscoa −2; **20/11 só desde 2024**, Lei 14.759/2023, a confirmar com o Jurídico), Carnaval (Páscoa −48/−47) e Corpus Christi (Páscoa +60) como opção da obra (padrão ligado) e manuais estaduais ou municipais com fonte (sem lista oficial). **Regra D3 (compilação):** calendário com `aplicaFeriadosObra` compilado SEM gerador de feriados usa a configuração padrão (nacionais, Carnaval e Corpus Christi), como a obra sem `feriados` salvo; o simulador (`sabadosConvocados`) usa o mesmo padrão; sem a marca, nenhum feriado é aplicado. Obra migrada e calendário importado ficam sem `aplicaFeriadosObra` (as exceções que já tinham, intactas); "Aplicar feriados da obra" é ação do usuário, com prévia. Hora extra: sábado como exceção útil (padrão, "todas as frentes") ou calendário derivado só para as frentes escolhidas. `WorkCalendar` segue para contas por dia ("+16 d.u.") e é derivado do calendário padrão.

**EVM** (`evm.ts`, PMBOK; só tarefas folha) — `PV = Σ BAC × fração planejada` (minutos úteis do **calendário da tarefa, sem as exceções úteis**, decorridos da linha de base até o fim do dia da data de status ÷ minutos úteis da linha de base); `EV = Σ BAC × %/100`; `AC = Σ custo real`; `SV = EV − PV`; `CV = EV − AC`; `SPI = EV/PV`; `CPI = EV/AC`; `EAC = BAC/CPI` (variantes `AC + (BAC − EV)` e `AC + (BAC − EV)/(CPI × SPI)`); `ETC = EAC − AC`; `VAC = BAC − EAC`; `TCPI = (BAC − EV)/(BAC − AC)`; término por SPI = duração planejada ÷ SPI. Meta do piloto: ±0,5% da planilha de controle (SPEC-10/13).

**DLP** (`supplies.ts`) — data necessária = início previsto da tarefa (ou o dia seguinte à data de status, se já iniciada ou atrasada); `DLP = necessária − (lead time + margem)`, em dias corridos.

**SINAPI** (`sinapi.ts`, `sinapiBudget.ts`) — `HH = quantidade × RUP`; `duração = HH ÷ (equipe × 8 h)`; dias no cronograma = `⌈duração⌉`, mínimo 1; `equipe = HH ÷ (dias × 8 h)`. Números pt-BR por `parseNumberBR`.

**Premissas da obra** (`premissas.ts`, ciclo 00005) — dado da obra, em versões imutáveis (`state.premissas`); a **versão vigente** é a de maior número com vigência ≤ data de status (a v1 vale desde o início da obra; vigência futura = "agendada"; vigência nova ≥ à da última versão). Percentuais em 0–100, convertidos na função (`1 + p/100`). `taxa efetiva = valorHora × (1 + encargos/100)` quando a taxa não inclui encargos (sem encargos informados, a taxa sem encargos é recusada); função fora das taxas usa `taxaFuncaoNaoCadastrada`. **Indireto mensal → diário (gate P1):** `diário = mensal × 12 ÷ dias úteis do calendário padrão no ano da vigência` (2026 com Carnaval e Corpus Christi: 249 dias úteis; R$ 249.000/mês = R$ 12.000/dia); o cálculo usa o diário sem arredondar, a conversão a validar com Orçamento/Custos. A margem da DLP (dias corridos) vem das premissas.

**Cenários** (`scenarios.ts`) — usam as premissas vigentes (o resultado registra a versão; a memória marca como "ilustrativas" o que ainda é padrão — Inviolável 7); hora extra, adicional e jornada exigem **RH + Jurídico** antes de virar regra. **Crashing:** horas por dia = `minutosPorDia ÷ 60`. **Hora extra:** custo = Σ, por sábado e por frente convocada ativa nele, `unidades × horas do sábado × taxa × (1 + adicional/100)`, com as **horas do sábado = minutos úteis da exceção do sábado no calendário da frente ÷ 60** (a mesma que o cronograma usa: 8 h no dia inteiro do calendário, 4 h no meio período; não `minutosPorDia ÷ 60`); "todas as frentes do calendário padrão" põe os sábados como exceção útil no calendário padrão (tarefas com calendário próprio não são convocadas; a memória lista as ativas que ficaram de fora, ● nas críticas); "frentes escolhidas" cria um calendário derivado por calendário base e conjunto de sábados (cópia + sábados como exceção útil, `origem: hora-extra`, nome único de até 60 caracteres) só para as escolhidas ativas num sábado convocado no cronograma de hoje, e o derivado leva só os sábados em que a frente trabalha depois da hora extra (o lag que chega a ela só conta o sábado em que ela trabalha: sem ganho sem custo); as demais ficam "não convocadas"; sábado que o calendário da frente já trabalha não é hora extra, e sábado que é feriado nesse calendário não é convocado (trabalho em feriado tem regra própria: RH e Jurídico). O calendário de hora extra não se atribui à mão e só sai pelo "desfazer" (que leva ao calendário padrão qualquer tarefa que ainda aponte para ele e avisa no log quando sobrescreve uma atribuição feita depois). O lag útil que chega a uma frente com calendário derivado conta o sábado (regra P1: calendário da sucessora). Desfazer remove os derivados e devolve cada tarefa ao calendário de antes. A recomendação de cenário é heurística de projeto, não norma.

**Diagnóstico** (`diagnosis.ts`) — texto determinístico: cada frase rastreável a um número calculado (SPEC-10, RF-10.7). Nada de número que não venha de `src/lib`.

**Store** (`useProjectStore.ts`) — derivados chamam `src/lib`; não reimplemente fórmula na store. `progressPatch` apropria custo real por estimativa (ver `divida-conhecida.md`).

## Regras

- Função pura; fórmula citada no comentário (`// SPI = EV ÷ PV`), com a fonte quando não for óbvia.
- Divisão por zero e entrada inválida tratadas de forma explícita: nada de `NaN`/`Infinity` no estado, na tela ou no XML. Fallback (ex.: `safeDiv`) declarado e testado.
- Mudança de convenção (unidade, arredondamento, inclusivo × exclusivo) é decisão: vai na ficha/plano e, se estrutural, em ADR (`/adr`).
- Número alterado: teste novo ou atualizado e o antes → depois no PR (Inviolável 1). Teste existente com valor mudado sem justificativa reprova.
- Performance (RNF-05.1: 3.000 tarefas/6.000 vínculos em < 500 ms) não justifica perder precisão.
