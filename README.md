# CronoAI — Copiloto de Planejamento de Obras & MS Project

[![CI](https://github.com/wesley93/cronoai/actions/workflows/ci.yml/badge.svg)](https://github.com/wesley93/cronoai/actions/workflows/ci.yml)
[![Docker](https://github.com/wesley93/cronoai/actions/workflows/docker.yml/badge.svg)](https://github.com/wesley93/cronoai/actions/workflows/docker.yml)

Aplicação web (Vue 3 + TypeScript + Pinia + Tailwind + Chart.js) para o engenheiro de planejamento de obras. Vem carregada com o **Edifício Residencial Aurora — 12 Pavimentos** (EAP com 20 tarefas, vínculos FS/SS, BAC, recursos, lead time e códigos SINAPI).

> **Estado:** protótipo funcional, rodando só no navegador, com dados de exemplo e IA simulada. O caminho até o uso em obra real está em [docs/specs](docs/specs/README.md).

## Rodar

```bash
npm ci
npm run dev                          # http://localhost:5180
```

Com Docker (sem instalar Node):

```bash
docker compose up --build app        # produção (Nginx) em http://localhost:8080
docker compose --profile dev up dev  # desenvolvimento com recarga automática em http://localhost:5180
```

Porta 8080 ocupada? bash: `CRONOAI_PORT=8088 docker compose up --build app`; PowerShell: `$env:CRONOAI_PORT=8088; docker compose up --build app`. Detalhes em [docs/devops.md](docs/devops.md).

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run ci` | Lint + type-check + testes com cobertura + build (o mesmo que o GitHub Actions roda) |
| `npm test` / `test:watch` | Testes do núcleo (Vitest), uma vez ou em modo observação |
| `npm run test:coverage` | Testes com cobertura de `src/lib` (mínimo de 80%; HTML em `coverage/`) |
| `npm run e2e:instalar` / `npm run e2e` | Baixa o Chromium (uma vez) / roda os testes E2E (Playwright) sobre o build de produção |
| `npm run lint` / `lint:fix` | ESLint (JS, TypeScript e Vue) |
| `npm run build` | Type-check + build de produção em `dist/` |

## Módulos

| Módulo | O que faz | Lógica |
|---|---|---|
| 1. Apontamento IA | Feed de canteiro (áudio transcrito, texto e foto) → De-Para para a linha da EAP, % sugerido, restrições, prévia do XML e do impacto, aprovação | [fieldAi.ts](src/lib/fieldAi.ts) |
| 2. Caminho Crítico | CPM com FS/SS/FF/SF e lag, reprogramação pela data de status, efeito dominó, Gantt, rede lógica. Cenários Crashing, Fast Tracking e Hora Extra com parâmetros, memória de cálculo, comparativo e recomendação | [cpm.ts](src/lib/cpm.ts), [scenarios.ts](src/lib/scenarios.ts) |
| 3. Suprimentos JIT | DLP = data necessária − lead time − margem; alertas de compra atrasada, ruptura e reagendamento; agenda de pedidos; cadastro e recebimento | [supplies.ts](src/lib/supplies.ts) |
| 4. Gerador SINAPI | Duração = (Quantidade × HH) ÷ (Equipe × 8 h); planilha orçamentária com importação CSV e geração em lote com vínculos de engenharia | [sinapi.ts](src/lib/sinapi.ts), [sinapiBudget.ts](src/lib/sinapiBudget.ts) |
| 5. Valor Agregado | PV, EV, AC, SPI, CPI, EAC (3 premissas), VAC, TCPI; Curva S interativa (por pacote, mensal/acumulado, clique no mês), tendência de SPI/CPI, diagnóstico executivo | [evm.ts](src/lib/evm.ts), [diagnosis.ts](src/lib/diagnosis.ts) |
| EAP / MS Project | Tabela editável, linha de base, data de status, trilha de decisões | [useProjectStore.ts](src/stores/useProjectStore.ts) |

O estado é único e reativo: toda ação recalcula CPM, EVM, Curva S e suprimentos na hora. O navegador guarda **várias obras** (IndexedDB), cada uma com UF, município, responsável e tabela SINAPI; o seletor "Obra ativa" no topo e a tela **Obras** criam, duplicam, excluem e trocam de obra. O estado salvo pela versão anterior (`cronoai-state-v1`) vira a 1ª obra, sem perda, e a chave antiga não é apagada. "Criar obra de exemplo" acrescenta o Edifício Aurora sem tocar nas suas obras. Falha de gravação e cota quase cheia aparecem numa faixa de aviso: exporte para `.xml` o que não pode se perder.

## MS Project (MSPDI)

[msProjectXmlParser.ts](src/lib/msProjectXmlParser.ts):
- `buildMspdiXml` gera o `.xml` (projeto, calendário, tarefas, vínculos, linha de base, campos SINAPI/lead time, recursos);
- `parseMspdiXml` lê arquivos do MS Project, respeitando `MinutesPerDay`, `LagFormat`, exceções de calendário e tarefas inativas;
- `validateMspdi` confere estrutura, UIDs, vínculos, formatos e a ordem dos elementos do [esquema MSPDI](https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference).

A exportação só baixa o arquivo se a validação passar. A validação no MS Project real é a SPEC-06.

## Qualidade e CI

GitHub Actions ([.github/workflows](.github/workflows)):
- **CI:** lint, tipos, testes, build e `npm audit` de produção;
- **Docker:** build e smoke test da imagem, sem publicar;
- **CodeQL:** análise de segurança;
- **Release:** em tag `vX.Y.Z`;
- **Dependabot:** atualizações semanais.

Fluxo de branches, proteção da `master` e como lançar uma versão estão em [docs/devops.md](docs/devops.md).

## Premissas e limites

- **A IA de campo é um motor local e determinístico** (léxico de obra, pavimento, percentual, restrições). Nenhum relato sai do navegador. Usar um modelo de linguagem ou transcrição externa exige aprovação de Segurança da Informação (SPEC-08).
- **Códigos SINAPI, RUP, custos, taxas horárias, lead times e fornecedores são ilustrativos.** Valide na [tabela SINAPI vigente](https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx) (SPEC-07).
- **Hora extra:** o adicional de 50% e o trabalho aos sábados dependem da convenção coletiva; valide com RH/Jurídico.
- **Opiniões de projeto, não normas:**
  - custo indireto de R$ 9.850/dia útil;
  - perda de 5% por congestionamento no crashing;
  - contingência de 4% no fast tracking;
  - recomendação de cenário pelo menor saldo entre os de risco baixo/médio.
- **Publicação em servidor:** procure a equipe de Infraestrutura.
- **Bibliotecas de terceiros** (Vue, Pinia, Chart.js, vue-chartjs, lucide, Tailwind, Nginx) precisam de revisão de segurança e de licença antes de produção.
