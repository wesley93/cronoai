# SPEC-10 — EVM com medição e custo real confiáveis

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 1 (regras de medição), 3 (custo real do ERP) |
| Prioridade | Alta |
| Esforço | M |
| Depende de | SPEC-04 (snapshots), SPEC-09 (ERP) |
| Validar com | Controladoria/Custos (apropriação), Planejamento (critérios de medição) |

## 1. Problema
- O EV usa o "% concluído" livre de cada tarefa. Na obra, o avanço físico segue **critérios de medição** (ex.: alvenaria por m² levantado, estrutura por laje concretada).
- O AC vem do seed ou de uma apropriação proporcional ao avanço ([useProjectStore.ts](../../src/stores/useProjectStore.ts), `progressPatch`, que usa o CPI da tarefa). Isso é uma estimativa, não o custo real.
- O PV é linear entre o início e o término da linha de base, mas muitos pacotes têm desembolso concentrado (concreto, elevador).

## 2. Objetivo
O EV reflete a medição física, o AC vem da contabilidade e o PV respeita a curva de cada pacote, alinhados às fórmulas usuais de EVM ([PMBOK Guide](https://www.pmi.org/standards/pmbok)).

## 3. Requisitos funcionais
- **RF-10.1 Método de EV por tarefa:** % físico, 0/100, 50/50, marcos ponderados (ex.: forma 30%, armação 30%, concretagem 40%) e unidades concluídas (m², m³, pavimentos).
- **RF-10.2 Critérios de medição** por tipo de serviço, configuráveis por obra (biblioteca padrão da empresa).
- **RF-10.3 Custo real:** importação do ERP por centro de custo ↔ pacote da EAP (mapeamento configurável), por competência. A apropriação proporcional atual vira apenas **estimativa**, marcada como tal.
- **RF-10.4 Curva de PV por pacote:** linear, front-loaded, back-loaded ou distribuição manual por mês.
- **RF-10.5 EAC** pelas três premissas já implementadas (`eacVariants`), mais EAC "bottom-up" informado pelo engenheiro para pacotes com replanejamento.
- **RF-10.6 Limiares e alertas:** SPI/CPI abaixo do limite configurável (ex.: 0,95) por pacote geram alerta e entram no diagnóstico executivo.
- **RF-10.7** O diagnóstico executivo ([diagnosis.ts](../../src/lib/diagnosis.ts)) cita a fonte de cada número (snapshot, ERP, estimativa).

## 4. Critérios de aceite
- [ ] Em 4 datas de status do piloto, PV, EV, AC, SPI e CPI batem com a planilha de controle da obra (±0,5%).
- [ ] Uma tarefa com método 0/100 só gera EV ao chegar a 100%.
- [ ] AC estimado e AC do ERP aparecem distintos na tela e no relatório.
