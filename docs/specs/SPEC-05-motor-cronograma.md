# SPEC-05 — Motor de cronograma com paridade MS Project

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 1 (paridade e calendários), 3 (recursos e nivelamento) |
| Prioridade | Alta |
| Esforço | G |
| Depende de | SPEC-03 (calendários), SPEC-06 (casos reais de teste) |
| Validar com | Engenharia de planejamento (regras da empresa) |

## 1. Problema
O CPM atual ([cpm.ts](../../src/lib/cpm.ts)) está correto para o caso de uso do protótipo, mas diverge do MS Project em pontos que aparecem em cronogramas reais:

| Lacuna | Impacto |
|---|---|
| Calendário único, em dias inteiros | Datas diferentes em obras com sábado ou turno |
| Sem calendário por tarefa ou recurso | Concretagem, fachada e instalações com jornadas próprias |
| Restrições só "Não iniciar antes de" | Faltam MSO, MFO, SNLT, FNET, FNLT e prazo final (*deadline*) |
| Lag só em dias úteis | Lag em % e em dias corridos é importado como aproximação |
| Atualização de progresso fixa | O MS Project tem "lógica retida" × "substituir progresso" e tarefas divididas |
| Sem recursos/nivelamento | Superalocação de equipes não aparece |
| Tarefas recorrentes, resumos com vínculo | Expansão simplificada |

## 2. Objetivo
Para qualquer `.xml` exportado do MS Project, o CronoAI calcula **as mesmas datas, folgas e caminho crítico**, ou explica a diferença na tela.

## 3. Requisitos funcionais
- **RF-05.1** Tempo em **minutos úteis** com calendários por intervalo (ex.: 07:00–12:00, 13:00–17:00), por dia da semana e com exceções.
- **RF-05.2** Calendário por tarefa (`Task.CalendarUID`) e por recurso, com a regra do MS Project para a interseção.
- **RF-05.3** Todos os tipos de restrição (ASAP, ALAP, MSO, MFO, SNET, SNLT, FNET, FNLT) e prazo final com indicador de violação.
- **RF-05.4** Lag em dias úteis, dias corridos (`edays`) e percentual da predecessora.
- **RF-05.5** Opção de agendamento do progresso: **lógica retida** (padrão do MS Project) ou **substituir progresso**, mais "mover o restante para depois da data de status".
- **RF-05.6** Folga total, folga livre e caminho crítico com limite configurável (`CriticalSlackLimit`) e múltiplos caminhos críticos.
- **RF-05.7** Recursos: carga por função e por semana (histograma), alerta de superalocação. Nivelamento opcional (Fase 3), respeitando prioridade e folga.
- **RF-05.8** Painel "Divergências com o MS Project": lista tarefas cuja data calculada difere da data do arquivo importado, com a causa provável.

## 4. Requisitos não funcionais
- **RNF-05.1** Recalcular obras de 3.000 tarefas e 6.000 vínculos em menos de 500 ms (Web Worker no front ou backend).
- **RNF-05.2** Motor puro, sem dependência de UI, coberto por testes de propriedade (ex.: folga ≥ 0 fora do caminho crítico).

## 5. Critérios de aceite (paridade)
- [ ] **Conjunto de referência:** 5 cronogramas reais anonimizados (≥ 300 tarefas cada) exportados do MS Project, com as datas do próprio MS Project como gabarito, versionados em `tests/fixtures/msproject/`.
- [ ] 100% das tarefas com início/término iguais ao gabarito (tolerância 0) e caminho crítico idêntico.
- [ ] Regressão automática no CI: qualquer diferença quebra o build.

## 6. Plano de entrega
1. Minutos úteis + calendários com intervalos e exceções (destrava SPEC-03).
2. Restrições completas + lags em `edays`/% + opções de progresso.
3. Painel de divergências + conjunto de referência no CI.
4. Recursos e histograma; nivelamento (Fase 3).
