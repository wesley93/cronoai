---
paths:
  - "src/**/*.ts"
  - "src/**/*.vue"
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/rules/divida-conhecida.md`) para o CronoAI em 25/10/2026.

# Dívida conhecida — imite a estrutura, nunca estes padrões

O código vizinho tem limitações vivas, listadas no `CLAUDE.md › Dívida conhecida` e nas specs. Imite **estrutura** (pastas, formato, nomes, forma dos testes); **não** amplie uma limitação abaixo nem a "conserte" de passagem — cada uma tem spec própria.

## Dívida registrada no CLAUDE.md

| Dívida | Onde aparece | Regra |
|---|---|---|
| Curva S reconstruída linearmente **só sem fechamentos e antes do 1º fechamento** (ciclo 00007) | `computeSCurve`/`earnedShareAt` (`lib/evm.ts`) | sem fechamentos a curva tem o aviso "reconstruído linearmente"; não trate esse trecho como medido |
| Premissas padrão ilustrativas (agora por obra, versionadas) | `premissasPadrao()` (`lib/premissas.ts`), catálogo `data/sinapiCatalog.ts` | os padrões seguem marcados "ilustrativa" até a validação com RH/Jurídico e Orçamento/Custos; não acrescente constante de premissa em `scenarios.ts` ou `supplies.ts` (vai em `PremissasObra`, com origem); o catálogo SINAPI é do ciclo 00006 (Inviolável 7) |
| Feriados estaduais e municipais só manuais (RF-03.5 parcial) | `feriadosObra.ts`, aba Premissas › Feriados | sem lista oficial embutida: a lista e a importação são da Fase 2; não invente feriado de UF ou município |
| Hora extra só em sábados (inteiros ou de 4 h); sem domingo, feriado, hora além da jornada, banco de horas nem compensação; `applyScenario` arredonda o custo comprometido a R$ inteiro (`Math.round`) | `simulateOvertime`, `applyScenario` | RF-03.6 só pede sábados; o arredondamento é dívida do gate P2 (o arredondamento bancário é só na exibição) |
| Cálculo sem recurso, nivelamento nem vários caminhos críticos | `cpm.ts`, `calendarioTrabalho.ts` | RF-05.2 por recurso, RF-05.6 e RF-05.7 não existem; não simule recurso nem nivelamento no motor |
| Tarefa agendada manualmente (`<Manual>1`) é calculada automaticamente | `parseMspdiXml`, `cpm.ts`, painel de divergências | a marca é preservada, o painel explica a divergência e a exportação devolve as datas do arquivo enquanto a tarefa não for alterada (alterada: leva as calculadas, com aviso); fixar as datas da tarefa manual no cálculo é ciclo próprio |
| PV ignora as exceções úteis do calendário (sábado de hora extra, dia útil extra do arquivo e exceção própria útil, como "concretagem trabalha no feriado") | `evm.ts`, `store.calendariosPv` | regra CR-2d: a linha de base calculada pelo CronoAI ignora exceções úteis; não "conserte" de passagem |
| Exceção recorrente sem lista legada e `WorkWeeks` só avisam; datas reais sem hora | `lerCalendarioMspdi` | expandir a recorrência pela regra e aplicar `WorkWeeks` ficam para depois |
| Edição de célula com 3.000 tarefas ~0,8 s em máquina livre a ~1,5 s com a máquina carregada (medido 802 ms, 1.364–1.435 ms e 1.443 ms em 25/10/2026), acima da meta de 500 ms da RNF-05.1 | `updateTask` (`useProjectStore.ts`), `calcularObra`/`verificarCalculo` (`horizonte.ts`), `cpm.desempenho.test.ts` | aceita no protótipo; o cálculo vai para o servidor nos ciclos 00016/00017 do `docs/specs/PLANO-FASE-2.md` (branch `feat/00011-backend-esqueleto`); não otimize de passagem |
| Calendário de 24 h: marco sem predecessora com SNET/MSO às 00:00 fora do início do projeto (motor mostra 24:00 do dia anterior; a importação mantém o dia) | `marcoDe` (`cpm.ts`) × heurística de 00:00 no import (`msProjectXmlParser.ts`) | divergência falsa de 1 dia no painel; 0 casos no corpus; conferir no MS Project real (M-6) antes de mudar a regra |
| Obra salva com `meta.startDate`/`meta.statusDate` inválidos fica ilegível | `eEstado` (`migracaoEstado.ts`) | o registro fica intacto; falta um modo "corrigir datas" para recuperar a obra (só ocorre com estado adulterado: os formulários validam as datas) |
| `mainTrade` (crashing) escolhe a maior quantidade excluindo só `'Servente'`: em 94 composições do SINAPI o ajudante tem coeficiente maior que o oficial (ex.: 107585, 4 armadores + 6 ajudantes: o crashing comprime o "Ajudante de armador") | `scenarios.ts` (`mainTrade`) | não aplique a regra de função principal do 00006 (`funcaoPrincipal`) no crashing de passagem: mudaria os números do PR-1 do 00005; ciclo próprio, com Orçamento/Custos |
| SINAPI com recorte: o HH das subcomposições (ex.: preparo de argamassa, operador de betoneira) **não** entra na duração; composições `SEM CUSTO` (2.155 em 09/2026, 1.753 com mão de obra) ficam fora do recorte, mesmo que a RUP delas seja útil; prazo pelo equipamento (CHP) das composições mecanizadas (estacas, usinagens) não é considerado; `%AS` só exibido, sem significado validado; supervisão não vira recurso | `sinapiRup.ts`, `scripts/sinapi/recorte.ts` | RUP = coeficiente publicado do 1º nível do Analítico (SPEC-07); a explosão de subcomposições, o uso "só RUP" e o CHP são ciclos próprios, com Orçamento/Custos |
| `vitest` 3 (críticas) e `tailwindcss` 3 (moderadas) com aviso de vulnerabilidade (dev) | `package.json` | as correções exigem `vitest` 5 e Tailwind 4, cada uma num PR próprio; não misture |
| `criarObra`, `duplicarObra` e `excluirObra` gravam o índice das obras fora da fila de gravação (a `trocarObra` já grava sob a fila desde o ciclo 00006) | `useProjectStore.ts` (índice das obras), `armazenamentoObras.ts` | janela estreita com uma importação de recorte ou um atraso de gravação: a obra nova pode sumir do índice até a próxima gravação, a chave de um recorte compartilhado pode sumir ("recorte não encontrado", reimportar) ou a obra excluída pode reaparecer como ilegível; sem perda de dado. Corrigir passando toda gravação de índice pela fila, no padrão da `trocarObra`; não conserte de passagem |
| Teto de custo unitário de R$ 10.000.000 recusa verba global maior (elevadores, subestação) | `LIMITES_LINHA` (`sinapiBudget.ts`) | contorno: lançar a verba em reais (quantidade = valor, custo R$ 1,00); subir o teto para 1e9 (quantidade × custo continua finito) depende do Orçamento/Custos |

## Dívida do ciclo 00007 (linhas de base e fechamentos)

| Dívida | Onde aparece | Regra |
|---|---|---|
| O custo da LB0 acompanha o `bac` vivo (no MS Project ficaria congelado), enquanto as LB1 a LB10 congelam o custo | `projetarLinhaBase`, `dadosDaLinhaBase` (`lib/linhasBase.ts`) | não "conserte" de passagem: muda os números da LB0; ciclo próprio com Planejamento/Controle e Orçamento (E-2) |
| A duração gravada na LB é o **vão** em minutos úteis (numa tarefa interrompida na data de status é maior que a duração: ~36,9 d em vez de 36 d); a `Duration` da LB0 do resumo sai 0 | `linhaBaseDoCronograma`, `taskNode` | só afeta a `Duration` exportada da LB n, não o PV |
| PV linear entre início e término da LB (regra do CronoAI); o MS Project distribui no tempo (`TimephasedData`, RF-04.8, fora do escopo) | `plannedFraction` | uma LB salva no meio da obra nasce com SPI < 1 |
| Hora das datas da LB e o `Work` da LB do arquivo não voltam ao .xml; LB0 sem datas no arquivo é calculada | parser | avisados na importação e na exportação; `Work` opaco no ciclo 00010 |
| A LB do valor agregado não muda o atraso nem as variações (G5 = b); o texto do RF-04.5 ("no PV e nas variações") está desatualizado | `analyzeDelay`, `finishVarianceDays` | atualização da spec com Planejamento/Controle; um seletor "comparar variações com LB0 | LBn" é ciclo próprio |
| O histórico de fechamentos fica só no navegador (apagar os dados do site apaga o histórico; `persist()` é pedido, mas o navegador decide); limite de 104 fechamentos e 52 retificações; sem excluir, arquivar nem importar o JSON | `armazenamentoObras.ts`, `fechamentos.ts` | exporte o JSON; a persistência real é a da SPEC-01 e a trilha com identidade é a da SPEC-02 (o autor é texto declarado) |
| `criarObra`, `duplicarObra` e `excluirObra` seguem gravando o índice fora da fila (dívida do ciclo 00006); o fechamento e a retificação passam pela fila com a guarda de obra | `useProjectStore.ts` | não conserte de passagem |

## Aproximações e armadilhas observadas no código

| Situação | Onde | O que fazer |
|---|---|---|
| Regras sem fonte oficial da Microsoft: lag entre calendários = o da sucessora (terceiros), semântica do `HonorConstraints` (os 134 arquivos do corpus gravam 0), exibição da folga de ALAP e `LinkLag` em % (percentual inteiro) | `calendarioDoLag` (`cpm.ts`), `lagDeMspdi`/`lagParaMspdi` | cada regra mora numa função; conferir no MS Project real (M-5/M-6) antes do piloto; não trate como validada |
| `safeDiv` devolve 1 com divisor zero (SPI/CPI = 1,00 com PV/AC = 0) | `lib/evm.ts` | não reuse para outra métrica sem decidir o fallback; não mostre como desempenho real |
| Custo real apropriado proporcionalmente ao avanço (fator 1,03 sem histórico) e arredondado a R$ inteiro | `progressPatch` (`stores/useProjectStore.ts`) | é estimativa (SPEC-10, RF-10.3); não trate como custo real nem copie o arredondamento |
| DLP usa dias **corridos** (`addCalendarDays`), o CPM usa dias **úteis** | `lib/supplies.ts` × `lib/cpm.ts` | não misture as unidades; declare qual usa em cálculo novo |
| Testes antigos com asserção só de direção (`toBeGreaterThan`) | `lib/*.test.ts` | não imite: cálculo novo fixa o número (`testes.md`) |
| `localStorage` indefinido no Node 26 | testes de store | `globalThis.localStorage?.clear?.()` no `beforeEach` |
| Persistência só no navegador (IndexedDB, "best-effort": o navegador pode apagar dados sob falta de disco; duas abas na mesma obra, a última gravação vence; sem `navigator.storage.persist()`) | `stores/armazenamentoObras.ts` | não prometa durabilidade nem sincronização; o aviso de cota e a exportação para `.xml` são a rede de segurança até a SPEC-01 (backend); `persist()` fica para o ciclo dos snapshots |

## Como consultar

```bash
node .claude/scripts/validar-regras.mjs --base {BASE}
```

## Achou dívida no arquivo que está mexendo

- **Dentro do escopo**: corrija, com teste que fixe o novo número (antes → depois no PR).
- **Fora do escopo**: não corrija de passagem. Registre no relatório (arquivo e linha) e siga.
