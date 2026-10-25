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
- **RF-07.1** Importar as planilhas mensais (sintética de composições e analítica de coeficientes) das **27 UFs**, por mês de referência e regime (desonerado e não desonerado). Na primeira versão o administrador faz o upload; a ingestão mensal automática a partir do site da Caixa fica no backend (Fase 2), com o aval da Segurança/Infra.
- **RF-07.1a** Armazenamento no backend com chave (UF, mês, regime, código); o front recebe só as composições da UF/regime/data-base da obra (nunca as 27 tabelas no navegador).
- **RF-07.2** Para cada composição, derivar a RUP por função a partir dos insumos de mão de obra da analítica (ex.: "PEDREIRO COM ENCARGOS" em H/unidade) e o custo unitário.
- **RF-07.3** Cada obra escolhe UF, data-base e regime (SPEC-03); obras de estados diferentes convivem na mesma empresa. Calculadora e planilha usam a tabela da obra ativa.
- **RF-07.4** Composições próprias da empresa (produtividade histórica) com prioridade sobre o SINAPI, com origem indicada.
- **RF-07.5** Fator de produtividade por frente (ex.: 1,15 em pavimento tipo repetitivo, 0,85 em áreas comuns), registrado na tarefa gerada. **(recomendação)**
- **RF-07.6** Planilha orçamentária: importar também `.xlsx`, além do CSV atual ([sinapiBudget.ts](../../src/lib/sinapiBudget.ts)).
- **RF-07.7** Ligação orçamento ↔ EAP: cada tarefa guarda os itens de orçamento que a compõem, e o BAC é a soma desses itens.

## 3a. Formato oficial a partir de 2025 (conferido em out/2026)
Desde 2025 a Caixa publica **um pacote nacional por mês** em "SINAPI - Relatórios mensais - a partir de 2025" (ex.: `SINAPI-2026-09-formato-xlsx.zip`, 15,1 MB). As séries por UF vão só até 2024. O arquivo `SINAPI_Referência_AAAA_MM.xlsx` contém:

| Aba | Conteúdo |
|---|---|
| `ISD` / `ICD` / `ISE` | Preços medianos de insumos (sem desoneração / com desoneração / sem encargos), **uma coluna por UF (27)**, com a origem do preço (C = coletado, CR = coeficiente de representatividade); ~4.880 insumos |
| `CSD` / `CCD` / `CSE` | Custo de composições por UF, mais o %AS, nos mesmos 3 regimes; ~10.600 composições |
| `Analítico` | Itens de cada composição: tipo (COMPOSICAO/INSUMO), código, unidade, **coeficiente** e situação; ~67 mil linhas. É a fonte da RUP por função (ex.: "SERVENTE COM ENCARGOS COMPLEMENTARES — H — 1,279") |

Notas para o leitor:
- O cabeçalho traz o mês de referência e os **encargos horista/mensalista por UF**.
- Na aba `CSD` o código da composição vem como fórmula/hiperlink (valor 0 com `data_only`): obter o código pela aba `Analítico` ou pela fórmula.
- Os nomes dos arquivos no zip usam codificação legada: normalizar ao extrair.
- Cópia local para desenvolvimento: `referencias/sinapi/2026-09/` (fora do git).

## 4. Critérios de aceite
- [ ] Importar o SINAPI de uma UF e mês reproduz o custo unitário publicado (tolerância R$ 0,01) em 20 composições amostradas.
- [ ] A RUP derivada bate com o coeficiente da analítica.
- [ ] Trocar a data-base recalcula o BAC dos pacotes gerados e mostra a diferença antes de aplicar.

## 5. Riscos
- Layout das planilhas da Caixa muda entre publicações → parser com mapeamento de colunas configurável e testes por versão de layout.
- Coeficiente SINAPI ≠ produtividade da equipe real → RF-07.4 e RF-07.5, e retroalimentação com a produtividade medida no campo (SPEC-08).
