# SPEC-04 — Data de status, snapshots e linhas de base

| Campo | Valor |
|---|---|
| Status | Proposta — pode ser feita no protótipo atual |
| Fase | 1 |
| Prioridade | Alta |
| Esforço | M |
| Depende de | SPEC-03 (premissas versionadas) |
| Validar com | Planejamento/Controle (rotina de fechamento) |

## 1. Problema
- A Curva S reconstrói o EV e o AC dos meses passados distribuindo o % atual de forma linear entre o início real e a data de status ([evm.ts](../../src/lib/evm.ts), `earnedShareAt`). O gráfico de "julho" não mostra o que foi medido em julho.
- Só existe **uma** linha de base, e "Salvar linha de base" a sobrescreve.
- Mudar a data de status não guarda a anterior.

## 2. Objetivo
Cada fechamento (semanal ou mensal) grava um **snapshot imutável** do avanço, custo e previsão. Curva S, tendência de SPI/CPI e relatórios passam a vir dos snapshots. Linhas de base têm versões (0 a 10, como no MS Project).

## 3. Requisitos funcionais
- **RF-04.1** Ação "Fechar data de status" grava o snapshot:
  - por tarefa: % físico, custo real, início/término previstos, folga total, crítica;
  - totais: PV, EV, AC, SPI, CPI, EAC e data de entrega prevista.
- **RF-04.2** Snapshot fechado não é editável. Correção gera um **snapshot de retificação** que referencia o original, com motivo obrigatório.
- **RF-04.3** A Curva S usa os snapshots para o passado e o cronograma reprogramado para o futuro. Entre dois snapshots, interpolação **explicitada** no gráfico (linha tracejada).
- **RF-04.4** Gráfico de tendência de SPI/CPI e "evolução da data de entrega" (data prevista em cada fechamento) a partir dos snapshots.
- **RF-04.5** Linhas de base numeradas (LB0…LB10), com nome, motivo, autor e data. Seleção de qual LB usar no PV e nas variações. Exportadas no MSPDI como `<Baseline><Number>n</Number>`.
- **RF-04.6** Comparação entre dois snapshots: tarefas que avançaram, atrasaram ou mudaram de custo (diff).
- **RF-04.7** Agendamento opcional: fechamento automático toda sexta às 18 h, pendente de confirmação do engenheiro. **(recomendação)**
- **RF-04.8** Importar histórico: ao importar um MSPDI com `TimephasedData` de avanço/custo, gerar snapshots retroativos. **(recomendação, depende de SPEC-06)**

## 4. Requisitos não funcionais
- **RNF-04.1** Snapshot de 3.000 tarefas gravado em menos de 2 s.
- **RNF-04.2** No protótipo (antes do backend), os snapshots ficam no `localStorage` com limite de 104 fechamentos (2 anos semanais) e exportação em JSON.

## 5. Critérios de aceite
- [ ] Depois de 3 fechamentos com avanços diferentes, a Curva S mostra exatamente os EV/AC gravados em cada um.
- [ ] Criar a LB1 não altera a LB0; o PV pode ser calculado contra qualquer uma.
- [ ] Retificar um snapshot preserva o original e registra o motivo.
- [ ] O MSPDI exportado contém todas as linhas de base gravadas.

## 6. Notas técnicas
- `computeSCurve` passa a receber `snapshots[]`. A reconstrução linear atual vira apenas *fallback* para obras importadas sem histórico, com aviso visível.
- O modelo de dados está na SPEC-01 (`snapshot`, `snapshot_tarefa`, `linha_base`, `linha_base_tarefa`).
