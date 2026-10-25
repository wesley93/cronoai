# SPEC-03 — Premissas da obra e calendários

| Campo | Valor |
|---|---|
| Status | Proposta — pode ser feita no protótipo atual |
| Fase | 1 |
| Prioridade | Alta |
| Esforço | M |
| Depende de | — |
| Validar com | RH/Jurídico (jornada, hora extra, adicional), Orçamento/Custos (encargos, indireto) |

## 1. Problema
Os números dos cenários e do EVM dependem de premissas fixas no código:

| Premissa | Onde está hoje | Valor |
|---|---|---|
| Custo indireto diário | [seed.ts](../../src/data/seed.ts) `dailyIndirectCost` | R$ 9.850/dia útil |
| Taxas horárias por função | [seed.ts](../../src/data/seed.ts) `HOURLY_RATES` | Pedreiro R$ 31,40… |
| Perda por congestionamento | [scenarios.ts](../../src/lib/scenarios.ts) `CONGESTION_FACTOR` | 5% |
| Mobilização por profissional | `MOBILIZATION_PER_WORKER` | R$ 1.200 |
| Adicional de hora extra | `OVERTIME_PREMIUM` | 50% |
| Contingência de retrabalho | `REWORK_CONTINGENCY` | 4% |
| Margem da DLP | [supplies.ts](../../src/lib/supplies.ts) | 3 dias (já editável) |
| Jornada | calendário fixo seg–sex, 8 h | — |

Além disso, o calendário é único: sem meio período no sábado, sem turnos e sem calendário por tarefa.

## 2. Objetivo
Cada obra tem a própria tela de premissas, versionada, com origem documentada. Todo cálculo usa essas premissas, e a mudança fica registrada.

## 3. Requisitos funcionais
- **RF-03.1** Tela "Premissas da obra" com os campos da tabela acima, mais: encargos sociais (%), regime (desonerado/não desonerado), jornada diária (h), dias úteis da semana, custo indireto mensal (convertido para dia útil).
- **RF-03.2** Taxas horárias por função com origem ("SINAPI <UF> <mês/ano>", "acordo coletivo", "proposta do empreiteiro") e vigência.
- **RF-03.3** Versões de premissas: alterar cria uma nova versão com data de vigência. Os cenários e o EVM mostram qual versão usaram.
- **RF-03.4** Calendários:
  - padrão da obra;
  - calendários alternativos (ex.: "Fachada — sem chuva", "Concretagem — sábado manhã");
  - exceções por data (feriado municipal, paralisação, sábado de 4 h);
  - jornada por dia da semana em horas.
- **RF-03.5** Feriados municipais/estaduais importáveis por UF/município (lista mantida pelo administrador).
- **RF-03.6** Cenário Hora Extra passa a aceitar **meio período** e **frentes escolhidas** (calendário só das tarefas selecionadas), substituindo a convocação de todas as frentes ativas.

## 4. Requisitos não funcionais
- **RNF-03.1** Mudar uma premissa recalcula cenários e EVM em menos de 1 s (obra de até 3.000 tarefas).
- **RNF-03.2** Valores monetários com 2 casas e arredondamento bancário documentado.

## 5. Critérios de aceite
- [ ] Alterar o custo indireto para R$ 12.000 muda a "economia de indireto" de todos os cenários na hora.
- [ ] Sábado de 4 h conta como 0,5 dia útil no CPM e na hora extra.
- [ ] O relatório de cenário mostra "Premissas v3 — vigência 01/11/2026".
- [ ] Os testes atuais continuam passando com as premissas padrão.

## 6. Notas técnicas
- O CPM ([cpm.ts](../../src/lib/cpm.ts)) trabalha com índice de dia útil. Para meio período, migrar para **minutos úteis**, como o MS Project faz (480 min/dia), ou para frações de dia. **(recomendação: minutos, para paridade com o MSPDI)**
- Hora extra, adicional e compensação de jornada **dependem da convenção coletiva**: a tela deve deixar isso explícito e o valor padrão deve ser validado por RH/Jurídico.
