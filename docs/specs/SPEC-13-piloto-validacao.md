# SPEC-13 — Piloto e validação em obra

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 4 |
| Prioridade | Alta |
| Esforço | M (8–12 semanas de acompanhamento) |
| Depende de | SPECs 01–06 e 10 no mínimo; 08 opcional |
| Validar com | Diretoria de engenharia (escolha da obra), Planejamento, Segurança/Jurídico (dados reais) |

## 1. Objetivo
Provar, numa obra real, que o CronoAI produz os mesmos números (ou melhores) que o processo atual (MS Project + planilhas). Só depois disso ele vira ferramenta de decisão.

## 2. Formato (recomendação)
- **Obra:** 1 obra em execução, com cronograma no MS Project e planilha de controle EVM existente.
- **Duração:** 8 semanas de **execução paralela**. O processo atual continua sendo o oficial; o CronoAI roda em sombra.
- **Rotina semanal:** fechamento da data de status nos dois processos e comparação automática (relatório de divergências).

## 3. Métricas de aceite

| Métrica | Meta |
|---|---|
| Datas de tarefas iguais ao MS Project | 100% (tolerância 0 dia útil) |
| PV/EV/AC/SPI/CPI × planilha de controle | ±0,5% |
| Ida e volta MS Project sem perda | 8/8 semanas |
| Acerto da tarefa sugerida no apontamento (se SPEC-08 ativa) | ≥ 90% |
| Tempo do engenheiro na atualização semanal | redução ≥ 40% (medido) |
| Alertas de DLP que evitaram parada | registrar casos |
| Incidentes de segurança/dados | 0 |

## 4. Entregáveis
- Relatório final com as divergências encontradas, as causas e as correções.
- Decisão de "vai/não vai" para expandir a mais obras, com o aval da diretoria de engenharia.
- Lista de ajustes para a v2.

## 5. Critérios de saída antecipada
- Divergência de datas não explicada por 2 semanas seguidas → pausar e corrigir o motor (SPEC-05).
- Qualquer incidente envolvendo dados pessoais → pausar e acionar Segurança/Jurídico.
