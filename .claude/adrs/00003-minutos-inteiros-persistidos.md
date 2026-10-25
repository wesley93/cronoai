# 00003 - Minutos inteiros persistidos no cronograma

**Data**: 2026-10-25
**Status**: Aceito pelo orquestrador em 25/10/2026 (P3 do gate do ciclo 00004, com autorização do usuário para seguir sem parar), sujeito à revisão do usuário no PR
**Spec/decisão relacionada**: SPEC-05 RF-05.1, RF-05.4, RNF-05.1; SPEC-03 §5 (sábado de 4 h = 0,5 dia) e §6; `docs/specs/PLANO-FASE-1.md` §3.4 ("ADR: opinião por minutos inteiros persistidos"); plano `.claude/ciclos/00004-motor-minutos-calendarios-plano.md`; ADR 00002 (cadeia de migrações por obra)

> Arquivo final: `.claude/adrs/00003-minutos-inteiros-persistidos.md`. Índice em `.claude/adrs/README.md`: `| [00003](00003-minutos-inteiros-persistidos.md) | Minutos inteiros persistidos no cronograma | 2026-10-25 | Proposto |`.

## Contexto
Hoje o motor e o estado salvo contam o tempo em **dias úteis inteiros**:
- `Task.durationDays` é arredondado (`Math.round`, `cpm.ts:113`);
- `PredecessorLink.lagDays` é somado ao índice de dia útil (`cpm.ts:100-103`);
- o calendário é um índice de dias com semana fixa seg–sex (`calendar.ts:63-96`).

O que não cabe nesse modelo:
- **Meio período:** o sábado de 4 h da SPEC-03 é 0,5 dia, e um índice inteiro de dia não o representa.
- **Arquivos do MS Project:** o MSPDI grava durações em horas e minutos (`PT57H8M24S`), lag e folga em décimos de minuto (`LinkLag`, `TotalSlack`), `MinutesPerDay` 450 ou 480 (2 e 132 arquivos no corpus local) e calendários por intervalo de horário.
- **Perdas no import de hoje:** com dias inteiros, 1 h vira marco (0 dia), PT12H vira 2 dias, 7 dias corridos viram 5 úteis por 5/7, e o lag % é zerado. Corpus do ciclo 00003: 4 durações viram marco, 20 são arredondadas e o lag % some.
- **Dia fracionário em ponto flutuante:** 100 min = 0,208333… dia. A soma de muitas parcelas desse tipo erra no último dígito, e o motor compara momentos ("começa depois de terminar"): um erro de 1e-12 muda a data.
- **Fuso:** o Brasil tem 4 fusos. O MSPDI grava data e hora sem fuso.

## Decisão
O cronograma persiste e calcula tempo em **minutos inteiros**:
- durações (`duracaoMin`), lags úteis e corridos (`lag.minutos`) e folgas (`folgaTotalMin`) em minutos inteiros;
- lag % como percentual;
- data e hora de restrição e prazo final como `yyyy-mm-ddThh:mm` na **hora local da obra, sem fuso**;
- data de status, datas reais e linha de base continuam `yyyy-mm-dd`;
- dias exibidos = minutos ÷ `minutosPorDia` da obra (padrão 480).

## Justificativa
- **Exatidão (exigência do CLAUDE.md, "o que mais importa é a precisão"):** aritmética só com inteiros, sem erro de arredondamento entre parcelas.
  - **Regra de arredondamento:** para o minuto inteiro mais próximo, **meio para cima** (`Math.round`; ex.: restante do UID 302 = 17.280 × 0,22 = 3.801,6 → **3.802** min). Só nas fronteiras de conversão: décimos de minuto do MSPDI → minutos; % × duração → minutos (restante e lag %); dias digitados com casas decimais → minutos; segundos do MSPDI → minutos.
  - Fora dessas fronteiras, nenhuma conta arredonda.
- **Paridade com o MS Project:** prática documentada.
  - A interface e o modelo de objetos do Project trabalham em minutos: [TaskDependency.Lag](https://learn.microsoft.com/en-us/office/vba/api/project.taskdependency.lag) ("Non-string values are interpreted as minutes", exemplo com 4800) e [Task.RemainingDuration](https://learn.microsoft.com/en-us/office/vba/api/project.task.remainingduration) ("in minutes"). A fórmula do restante está em [Remaining Duration (task field)](https://support.microsoft.com/en-us/project/remaining-duration-task-field): Duração − (Duração × % concluído).
  - O MSPDI usa minutos e décimos de minuto ([Project XML Data Interchange Schema Reference](https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference)).
  - O `especialista-obra` confere os links na tarefa 0 do ciclo 00004.
- **Calendário por intervalo (RF-05.1):** intervalos como 07:00–12:00 ou sábado 08:00–12:00 viram contas de minuto útil sem caso especial.
- **Sem fuso (opinião, coerente com o MSPDI):** o horário de trabalho é relógio de parede do canteiro. Converter fuso só criaria erro (obra em Manaus vista de São Paulo). A aritmética usa `Date.UTC` apenas como relógio, como o `calendar.ts` já faz.
- **Legibilidade (opinião):** 480, 2.400 e 5.760 são reconhecíveis nos testes e no PR. Décimos de minuto multiplicam tudo por 10.

## Alternativas descartadas
| Alternativa | Motivo |
|---|---|
| Dias fracionários (`number` em dias) | Erro de ponto flutuante na soma e na comparação de momentos (100 min = 0,2083… dia). O dia depende de `MinutesPerDay` (450 × 480), e a mesma duração em dias muda de tamanho entre arquivos |
| Décimos de minuto inteiros (unidade de `LinkLag`/`TotalSlack` no MSPDI) | Preserva segundos múltiplos de 6 (ex.: `PT57H8M24S` = 34.284 décimos). Segundos só aparecem em durações guiadas por recurso, que estão fora da Fase 1 (RF-05.7). A interface e a VBA do Project exibem e aceitam minutos. Multiplica por 10 todos os números dos testes e da tela. Fica como revisão se a Fase 3 trouxer recursos (seção Revisão) |
| Segundos ou milissegundos (timestamp) | Precisão sem uso. Puxa para `Date` com fuso, que a decisão evita |
| Data-hora com fuso (ISO com `Z` ou offset) | O MSPDI não tem fuso, e a obra trabalha no relógio local. Converter erraria a hora em obras fora do fuso do navegador |
| Manter dias inteiros e tratar sábado de 4 h como dia inteiro | Não atende a SPEC-03 nem a SPEC-05 e mantém as perdas do import |

## Consequências
**Positivas**
- Sábado de 4 h, turnos e exceções com horário passam a ser exatos.
- Durações, lags (úteis, corridos e %) e restrições importados do MS Project deixam de ser aproximados ou zerados.
- Uma única unidade no motor, no estado e no MSPDI, com conversões num módulo só (`src/lib/calendarioTrabalho.ts`, e no parser só décimos ↔ minutos).

**Negativas / trade-offs**
- Migração do estado de todas as obras (esquema 2 → 3, inclusive o `undo` por obra), feita pela cadeia do ADR 00002. Reverter o ciclo deixa obras no esquema 3, recusadas pelo app antigo (sem sobrescrita).
- **Tolerância de 1 min**, só em dois casos, na comparação com o MS Project, na ida e volta e no painel: (i) durações derivadas de % (restante de tarefa iniciada, lag %), em que o MS Project pode mostrar o minuto vizinho (ex.: 302 termina 16:21 ou 16:22); (ii) durações do arquivo com segundos (só guiadas por recurso, ex.: `PT57H8M24S`), arredondadas com aviso no import. **Em todos os outros casos, igualdade exata.**
- Folgas e durações passam a poder ser fracionárias em dias na tela ("55,3 d"): exige formatador próprio.
- O `WorkCalendar` em dias continua para contas por dia ("+16 d.u.", previsão pelo SPI): convivem duas visões de calendário, uma derivada da outra.

**Efeito nos números**
- E1 (refatoração): nenhum. As 20 folhas do Aurora mantêm datas e folgas, porque a migração usa `Math.round(dias) × 480`, o mesmo arredondamento do motor de hoje.
- Mudam de propósito, no ciclo 00004, com antes e depois no PR:
  - o restante de tarefa iniciada passa a ser exato (E2): inícios do Aurora recuam 1 dia, mas a entrega 2027-06-23 e o "+16 d.u." ficam;
  - o MSPDI passa a ler e gravar horários, lags e durações exatos (E3).

## Validações com outras áreas
Nenhuma para aceitar: a decisão é técnica e local ao navegador. A regra de jornada (quantas horas tem o dia da obra) continua sendo premissa da SPEC-03 e, quando virar regra de hora extra, passa por **RH + Jurídico**.

## Revisão
Revisar se:
- a Fase 3 trouxer agendamento por recurso (RF-05.7) e os segundos das durações guiadas por recurso passarem a importar;
- a paridade com 5 cronogramas reais (SPEC-05 §5) mostrar diferença atribuível ao arredondamento de minuto;
- o backend (SPEC-01, ADR 00001) adotar outra unidade para o mesmo dado.
