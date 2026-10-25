# SPEC-07 — Tabela SINAPI oficial e composições

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 1 |
| Prioridade | Média |
| Esforço | M |
| Depende de | SPEC-03 (UF, regime, data-base nas premissas) |
| Validar com | Orçamento/Custos (uso de SINAPI × composições próprias) |

## 1. Problema
O catálogo ([sinapiCatalog.ts](../../src/data/sinapiCatalog.ts)) tem 12 composições com códigos, RUP e custos **ilustrativos**. A produtividade real vem das composições analíticas do SINAPI (coeficientes de mão de obra por unidade), que variam por UF, mês e regime (desonerado ou não).

## 2. Objetivo
Importar a tabela oficial publicada pela Caixa ([página do SINAPI](https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx)) e usar os coeficientes reais de cada composição para dimensionar duração e equipe.

## 3. Requisitos funcionais
- **RF-07.1** Importar as planilhas mensais (sintética de composições e analítica de coeficientes) por UF, mês de referência e regime. O administrador faz o upload; nada é baixado automaticamente de terceiros sem aval.
- **RF-07.2** Para cada composição, derivar a RUP por função a partir dos insumos de mão de obra da analítica (ex.: "PEDREIRO COM ENCARGOS" em H/unidade) e o custo unitário.
- **RF-07.3** A obra escolhe UF, data-base e regime (SPEC-03). Calculadora e planilha usam essa tabela.
- **RF-07.4** Composições próprias da empresa (produtividade histórica) com prioridade sobre o SINAPI, com origem indicada.
- **RF-07.5** Fator de produtividade por frente (ex.: 1,15 em pavimento tipo repetitivo, 0,85 em áreas comuns), registrado na tarefa gerada. **(recomendação)**
- **RF-07.6** Planilha orçamentária: importar também `.xlsx`, além do CSV atual ([sinapiBudget.ts](../../src/lib/sinapiBudget.ts)).
- **RF-07.7** Ligação orçamento ↔ EAP: cada tarefa guarda os itens de orçamento que a compõem, e o BAC é a soma desses itens.

## 4. Critérios de aceite
- [ ] Importar o SINAPI de uma UF e mês reproduz o custo unitário publicado (tolerância R$ 0,01) em 20 composições amostradas.
- [ ] A RUP derivada bate com o coeficiente da analítica.
- [ ] Trocar a data-base recalcula o BAC dos pacotes gerados e mostra a diferença antes de aplicar.

## 5. Riscos
- Layout das planilhas da Caixa muda entre publicações → parser com mapeamento de colunas configurável e testes por versão de layout.
- Coeficiente SINAPI ≠ produtividade da equipe real → RF-07.4 e RF-07.5, e retroalimentação com a produtividade medida no campo (SPEC-08).
