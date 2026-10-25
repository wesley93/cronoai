# SPEC-09 — Suprimentos integrado a compras/ERP

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 3 |
| Prioridade | Média |
| Esforço | M |
| Depende de | SPEC-01, SPEC-02 |
| Validar com | Suprimentos/Compras, TI dona do ERP |

## 1. Problema
O Módulo 3 ([supplies.ts](../../src/lib/supplies.ts)) calcula DLP, alertas e agenda, mas os pedidos, entregas e lead times são digitados à mão e não conversam com o sistema de compras.

## 2. Objetivo
Os insumos críticos vêm do orçamento e da EAP. Pedidos e entregas vêm do ERP, e o CronoAI avisa antes da DLP vencer.

## 3. Requisitos funcionais
- **RF-09.1** Insumos gerados a partir do orçamento (SPEC-07 RF-07.7): quantidade por tarefa e curva de consumo ao longo da duração (não só no início).
- **RF-09.2** Integração com o ERP (API ou arquivo): pedido, fornecedor, data prometida, recebimento e nota fiscal. Pedido emitido no ERP muda o status no CronoAI.
- **RF-09.3** Lead time por fornecedor e insumo, com histórico (prometido × realizado) para sugerir o lead time real.
- **RF-09.4** Entregas parciais (lotes) e estoque no canteiro, com alerta de **excesso de estoque** quando a frente atrasar (o `SPEC.md` original cita esse caso).
- **RF-09.5** Notificação da DLP (SPEC-11) para Suprimentos: 7 dias antes, 1 dia antes e vencida.
- **RF-09.6** Fluxo de caixa de compras: valores por mês a partir das datas de entrega, comparado ao planejado.

## 4. Critérios de aceite
- [ ] Um pedido criado no ERP aparece no CronoAI em até 15 min, com o status atualizado.
- [ ] Atrasar uma tarefa recalcula a DLP e a sugestão de reagendamento de todos os seus insumos.
- [ ] O relatório "compras da semana" lista os insumos com DLP nos próximos 7 dias.

## 5. Riscos
- ERP sem API → integração por arquivo agendado como primeira etapa.
