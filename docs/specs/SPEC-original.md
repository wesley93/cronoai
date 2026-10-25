# SPEC: CronoAI — Copiloto de Planejamento de Obras Integrado ao MS Project

## 1. Visão Geral
Plataforma SaaS Web para Engenheiros de Planejamento que automatiza a atualização do MS Project a partir de apontamentos de canteiro (áudio/foto via WhatsApp), recalcula caminho crítico com IA, gerencia compras Just-in-Time, gera cronogramas a partir de orçamentos SINAPI e monitora Valor Agregado (EVM / Curva S) em tempo real.

## 2. Stack Tecnológica Recomendada
- **Frontend:** Vue 3 (Composition API) + TypeScript + Vite + Tailwind CSS + Lucide Icons + Apache ECharts (ou Chart.js para Curva S e Gantt interativo) + Pinia.
- **Backend:** .NET 8 Web API (C#) ou Python (FastAPI).
  - *Leitura/Escrita MS Project:* Biblioteca `net.sf.mpxj` (via NuGet `MPXJ.Net` no C# ou wrapper no Python) + parser nativo de MS Project XML (MSPDI schema).
- **Banco de Dados:** PostgreSQL (com extensão `pgvector` para busca semântica na EAP/WBS) + Redis (filas e cache).
- **IA & Mensageria:** 
  - LLM (OpenAI / Claude API) com Structured Outputs (JSON Schema) para mapeamento De-Para (fala do pedreiro -> UniqueID da EAP).
  - Whisper / Speech-to-Text para transcrição de áudios com ruído de obra.
  - Visão Computacional para validação de avanço físico por foto.

## 3. Os 5 Módulos Core (As 5 Dores)

### Módulo 1: Sincronizador MS Project & Apontamento Multimodal (Dor 1)
- Upload e exportação de arquivos `.xml` (MSPDI) e `.mpp` do MS Project.
- Simulador/Inbox de WhatsApp de Canteiro: recebe áudio transcrito + foto do encarregado/pedreiro.
- Motor de IA "De-Para Semântico": converte jargão de obra ("tijolo baiano no 2º andar") no `UniqueID` exato da EAP (`03.02.01 - Alvenaria de vedação Pav. Tipo 02`).
- Fila de Aprovação do Engenheiro: tela lado a lado (Sugestão da IA + Evidência de Foto/Áudio vs. Valor Atual no MS Project) com botão "Aprovar e Atualizar Linha de Base".

### Módulo 2: Simulador Preditivo de Caminho Crítico (Dor 2)
- Identificação automática de tarefas críticas (`IsCritical = true`, `TotalSlack <= 0`).
- Cálculo do "Efeito Dominó" quando um apontamento atrasa uma atividade predecessora.
- Gerador de Planos de Recuperação via IA: sugere 3 cenários matemáticos para recuperar o atraso:
  1. *Crashing* (adicionar recursos/pedreiros na tarefa sucessora e calcular impacto financeiro).
  2. *Fast Tracking* (alterar vínculo lógico de FS para SS com latência/lag).
  3. *Calendário* (habilitar horas extras/sábados e recalcular data de término).

### Módulo 3: Orquestrador de Suprimentos Just-in-Time (Dor 3)
- Cruzamento da data de início planejada/recalculada das tarefas com o *Lead Time* de compra e entrega dos insumos críticos (cimento, aço, porcelanato, escoras).
- Cálculo da **Data Limite de Pedido (DLP)**: `Data Início da Tarefa - Lead Time do Fornecedor - Margem de Segurança`.
- Alertas visuais de "Risco de Parada de Frente de Serviço" e alerta de "Excesso de Estoque no Canteiro" (quando a obra atrasa e a entrega precisa ser postergada).

### Módulo 4: Gerador de EAP e Cronograma via Orçamento SINAPI (Dor 4)
- Importação de planilha orçamentária (CSV/Excel) com códigos SINAPI, quantitativos ($m^2$, $m^3$, kg) e custos.
- Dimensionamento automático de duração usando coeficientes de produtividade (RUP - Razão Unitária de Produção em $HH/unidade$):
  $$\text{Duração (dias)} = \frac{\text{Quantidade} \times \text{Coeficiente } HH}{\text{Nº de Profissionais na Equipe} \times 8\text{h}}$$
- Geração automática de vínculos de precedência lógica padrão de engenharia (Fundação -> Supraestrutura -> Alvenaria -> Instalações -> Revestimentos) e exportação direta para `.xml` do MS Project.

### Módulo 5: Analista de Valor Agregado (EVM) e Curva S (Dor 5)
- Cálculo automático dos indicadores do PMBOK/EVM para cada pacote da EAP e para a obra global:
  - **PV (Planned Value / BCWS):** Valor Planejado até a data de status.
  - **EV (Earned Value / BCWP):** Valor Agregado (% Física Concluída $\times$ Orçamento na Conclusão - BAC).
  - **AC (Actual Cost / ACWP):** Custo Real incorrido.
  - **SPI (Schedule Performance Index):** $\text{SPI} = \frac{\text{EV}}{\text{PV}}$ (alerta se menor que 1.0).
  - **CPI (Cost Performance Index):** $\text{CPI} = \frac{\text{EV}}{\text{AC}}$ (alerta se menor que 1.0).
  - **EAC (Estimate at Completion):** Projeção de custo final da obra ($\text{EAC} = \frac{\text{BAC}}{\text{CPI}}$).
- Gráfico de Curva S tripla (Previsto, Agregado e Realizado) + Resumo Executivo narrado por IA.