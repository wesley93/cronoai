---
issue: —
spec: SPEC-04 — RF-04.1 a RF-04.6; RNF-04.1; RNF-04.2 (com a decisão de armazenamento do ADR 00002)
branch: feat/00007-snapshots-linhas-base
base: feat/00006-sinapi-layout-2025 (PR empilhado; HEAD dd58ba9). Com o 00006 na master, a base passa a ser a master
faixa: 3 (T2, T3, T4)
ficha_ou_plano: .claude/ciclos/00007-snapshots-linhas-base-plano.md (emendas 01 e 02)
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00007 — Fechamento da data de status (snapshots imutáveis), retificação, Curva S de fechamentos e linhas de base LB0 a LB10

## Resumo
- **O que é:** cada obra passa a guardar o que foi medido em cada fechamento e a ter as linhas de base como no MS Project. Contém:
  - linhas de base LB0 a LB10 por obra, com nome, motivo, autor (texto declarado) e data; sobrescrever pede confirmação e motivo;
  - a **LB do valor agregado** (`meta.linhaBaseAtiva`) vale para PV, EV, BAC, índices, Curva S e previsão pelo SPI; atraso, variações, cenários, DLP, Gantt e EAP continuam contra a LB0 (G5 = b);
  - LB0 a LB10 e `BaselineForEarnedValue` no MSPDI, na ida e na volta;
  - "Fechar data de status": fechamento imutável, gravado numa transação (`add`, nunca `put`), com totais, pacotes e tuplas por tarefa (com o PV);
  - retificação com motivo obrigatório, que preserva o original;
  - Curva S com o EV e o AC **gravados** em cada fechamento, interpolação pontilhada entre fechamentos e reconstrução ancorada no 1º;
  - tendência de SPI/CPI, evolução da entrega, comparação entre dois fechamentos e exportação do histórico em JSON;
  - migração do estado salvo do esquema 5 para o 6 e do IndexedDB da estrutura 2 para a 3 (stores `fechamentos` e `fechamentoTarefas`).
- **Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR:**
  - gate: G1 = (a) duas stores com `add`; G2 = (a) LB0 nos campos atuais e LB1 a LB10 num mapa por tarefa; G3 = (a) interpolação em dias úteis e reconstrução ancorada no 1º fechamento; G4 = (a) 104 fechamentos + 52 retificações; G5 = (b) seguir o MS Project; G6 = (a) custo gravado na LB n;
  - emenda 01: E-1 a E-12 da tarefa 0 aceitas; emenda 02: esquema 5 → 6 (o 00006 ficou com o 4 → 5);
  - rodada 02: rede de segurança antes de gravar; limite de WBS de 200 caracteres; desempate da sequência repetida por `fechadoEm` e `id`, com aviso; Enter nos campos longos; metadado da LB0 criado na inclusão por SINAPI ou planilha; `salvaEm` nas LBs importadas; rótulo "obra na data de status"; textos da faixa da D-14, da tendência e dos cartões de término;
  - rodada 03: LB importada sem `dataStatus`; nota "a LBk do fechamento não existe mais"; término da LB0 no cartão "Pelo CPM"; legenda da tendência por pacote; aviso do desvio 9 com o efeito na LB0; aviso de WBS acima de 200 na importação; regra única `temDadoLb0`;
  - rodada 04: mensagem da rede de segurança só com o UID e o tamanho do WBS; subtítulo e nota da tendência no recorte por pacote.
  - Todas: **decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR.**
- **Números do Edifício Aurora:** com a LB0 e sem fechamento, nenhum número mudou: entrega 2027-06-23 (+16 d.u.), SPI 0,888274, CPI 0,934942. Exportação MSPDI do seed igual à da base (SHA-256 `a401d3a8…09e18e`, comprimento 79.670; `testes` r01 a r03). O 1º fechamento (FE-1) grava BAC 19.113.000,00, PV 7.259.250,00, EV 6.448.200,00, AC 6.896.900,00 e EAC 20.442.984,04, conferidos à mão pelo `especialista-obra`. As mudanças de propósito estão em "Números que mudaram".
- **O que você precisa fazer:**
  - revisar no PR as decisões acima, em especial a mudança do S-2 do plano (sequência repetida deixa de ser ilegível) e o limite de WBS de 200, que não viraram emenda do plano;
  - abrir no MS Project real o `.xml` com LB1 a LB3 e `BaselineForEarnedValue` (M-4);
  - olhar na tela os textos que mudaram depois da verificação visual (feita em 6aeda18);
  - levar a **Planejamento/Controle**, **Orçamento/Controladoria**, **Jurídico** e **Infraestrutura** os itens da última seção.
- **Estado:** validadores aprovados na rodada 03 (e99486a): `testes` (gates verdes com `--maxWorkers=2`; mutação (x) fechada; migração 5 → 6 idêntica byte a byte nas fixtures reais), `arquiteto` e `especialista-obra` APROVADOS; `seguranca` APROVADO na rodada 02 (031f156) e não acionado na 03 (só texto e teste). A rodada 04 (9a05047) mudou só 2 textos, sem revalidação; 2ab750b só alinha um comentário. Auditoria independente r01 (318a9f7): REPROVADO só pelo registro (corrigido) e pelo `npm run ci` sem prova de verde na máquina carregada; código e gates obrigatórios PASS. **Estado: aprovado.** Reauditoria (4189bb1) APROVADO; falta o CI do PR.

## Pedido
Ciclo 00007 do `docs/specs/PLANO-FASE-1.md` §3.7 (SPEC-04), conforme a §01 do plano. O pedido do usuário é o mesmo do ciclo 00006 ("Pode fazer todas as fases").

## Triagem
- **T1:** não. `cpm.ts` e `calendarioTrabalho.ts` não mudam. "Salvar LB n" usa o cronograma previsto que já existe; a regra da data de status não muda nenhuma data calculada.
- **T2:** `computeSCurve` passa a usar os fechamentos; PV, EV, BAC, SPI, CPI, EAC, Curva S, EVM por pacote e previsão pelo SPI passam a usar a LB do valor agregado; totais do fechamento e da retificação; tendência; comparação.
- **T3:** o import lê as LB1 a LB10 (antes descartadas, com aviso) e o export grava `<Baseline>` de 0 a 10 e `BaselineForEarnedValue`. O JSON do histórico é formato novo só de saída.
- **T4:** esquema 5 → 6 (`ProjectState.linhasBase`, `Task.linhasBase?`, `meta.linhaBaseAtiva?`); IndexedDB estrutura 2 → 3 (stores de fechamento, mantendo `recortesSinapi`).
- **T5:** não. Nenhum arquivo externo novo; os textos novos são digitados pelo usuário e aparecem só por interpolação. Dependência nova: nenhuma.
- **T6 a T8:** não.
- **Faixa 3 (T3).** `seguranca` e `especialista-obra` obrigatórios. O `classificar-diff` (orquestrador e auditoria, no código final) confirma: faixa exigida 3 — T2, T3, T4 (ver G-CLASSIF).

## Commits
| SHA | Conteúdo |
|---|---|
| 8bca11a | Plano de snapshots e linhas de base, parecer da tarefa 0 e emendas 01 e 02 |
| e126648 | Tarefa 1: caracterização do Aurora na base 00006, verde antes de qualquer mudança |
| c73578b | E1: LB0 a LB10 por obra, LB do valor agregado no PV, EV e BAC e migração 5 → 6 |
| eec00bd | E2: linhas de base 1 a 10 e `BaselineForEarnedValue` na ida e volta do MSPDI |
| bf999cb | E3: fechamento imutável da data de status e retificação com motivo; estrutura 3 do IndexedDB |
| 6aeda18 | E4: Curva S e tendência pelos fechamentos, comparação, exportação do histórico, desempenho e documentação |
| 031f156 | Rodada 02: registro que não passa na leitura, LB0 sem metadado, nota da LB, quebra de linha e diálogo |
| e99486a | Rodada 03: LB0 do desvio 9, WBS com controle, mensagem da rede e notas da LB |
| 9a05047 | Rodada 04: texto livre do arquivo fora da mensagem e notas do recorte por pacote |
| 2ab750b | Comentário da mensagem da rede de segurança alinhado à rodada 04 (orquestrador; 1 linha de `fechamentos.ts`) |
| 318a9f7 | Registro do ciclo (rodadas 01 a 04, matriz e ressalvas) |
| f34214e | Registro com a auditoria r01 e as correções que ela pediu |
| 4189bb1 | Prova do `npm run ci` com todos os workers, em máquina menos carregada |

## Rodadas
| Rodada | testes | arquiteto | especialista-obra | seguranca |
|---|---|---|---|---|
| 01 (6aeda18) | APROVADO, 4 notas: (1) R-3 sem teste de comportamento (mutação a1 sobrevive); (2) `test:coverage` com todos os workers falha em testes antigos com teto de 5 s, só por carga da máquina; (3) guarda de desempenho do CI mais fraca que a do plano (desvio 6); (4) testes pouco discriminantes (`toBeDefined`, R-2 por texto) | AJUSTAR: R-1 (diálogo trava ao salvar a LB0 de obra sem o metadado), R-2 (desvio 9 sem teste) e R-3 (documentação) bloqueantes; N-1 a N-10 não bloqueiam; os 15 desvios aceitos | AJUSTAR: P-1 (= R-2) e P-2 (nota "fechado contra a LBk" não percebe a troca de LB por importação) bloqueantes; P-3 e P-4 opinião. Todos os números recalculados à mão conferem | REPROVADO: SEG-1 Alto (fechamento gravado sem o validador da leitura; um `.xml` com TAB no nome do pacote ou WBS longo bloqueia a obra para sempre); SEG-2 Baixo (sequência repetida por duas abas); SEG-3 a SEG-5 Info |
| 02 (031f156) | APROVADO: 1.168 passaram; notas: mutação (x) sobrevive (nenhum teste com controle no WBS); S-2 do plano mudou; retificar sem teste da rede e `ConstraintError` sem teste | APROVADO: R-1 a R-3 fechados; NB-1 a NB-5 não bloqueiam | AJUSTAR: R-1 (fixar no teste a LB0 calculada do desvio 9); R-2 opinião (o aviso deve dizer o efeito na LB0) | APROVADO: SEG-1 fechado; 3 Info |
| 03 (e99486a) | APROVADO: 1.170 passaram; (x) cai; migração 5 → 6 com saída igual à de 031f156 | APROVADO: NB-2, NB-4 e NB-5 fechados; observação sobre `keysBaseline` sem LB0 | APROVADO: R-1 e R-2 fechados; O-1 (WBS do arquivo na mensagem) para o `seguranca`; O-2 e O-3 opinião | não acionada (rodada só de texto e teste) |
| 04 (9a05047) | não acionado | não acionado | não acionado | não acionado |

A rodada 04 mudou só 2 textos (O-1 e O-2), por decisão do orquestrador, sem revalidação; os gates dela são declarados pelo `dev-frontend`. O commit 2ab750b, do orquestrador, só troca o comentário da mensagem da rede de segurança (1 linha).

**Auditoria independente** (`revisor`, MODO AUDITAR), fora das colunas dos validadores:
- **r01 (318a9f7, código = 2ab750b):** REPROVADO, sem defeito de código. Gates obrigatórios no HEAD verdes (lint, tipos, cobertura com `--maxWorkers=2`, E2E 41, build, corpus 419, regras 0/0, classificar-diff faixa 3, desempenho mediana 1.443 ms). Achados: 1 Médio (`npm run ci` com todos os workers deu exit 1 na máquina carregada: `cpm.desempenho` 2.410 ms > 2.000, isolado 368 ms; o gate do PR fica sem prova de verde) e 3 Baixos de coerência do registro, corrigidos neste registro.
- **Reauditoria (4189bb1):** APROVADO. Os 3 Baixos foram corrigidos no registro. O Médio fechou pelo `npm run ci` verde do orquestrador com todos os workers (f34214e). A reexecução da auditoria com a máquina carregada falhou só por tempo (2 tetos de 2.000 ms e 8 timeouts de 5 s, 2 em testes do ciclo); o CI do GitHub no PR é a confirmação final.

### Testes, antes → depois
| Ponto | Vitest | E2E | Fonte |
|---|---|---|---|
| Base (dd58ba9, código final do 00006) | 933 passaram, 54 pulados (987) | 33 | declarado pelo `dev-frontend` (relatório r01) |
| E4 (6aeda18) | 1.142 passaram, 56 pulados (1.198); 50 arquivos (2 pulados) | 41 | `dev-frontend`; `testes` r01 |
| Rodada 02 (031f156) | 1.168 (+26), 56 pulados (1.224); 53 arquivos (2 pulados) | 41 | `dev-frontend`; `testes` r02 |
| Rodada 03 (e99486a) | 1.170 (+2), 56 pulados (1.226); 53 arquivos (2 pulados) | 41 | `dev-frontend`; `testes` r03 |
| Rodada 04 (9a05047) | 1.170 passaram, 56 pulados | 41 | declarado pelo `dev-frontend` |
| 2ab750b | 1 arquivo, 88 passaram (o nome do arquivo não aparece na saída) | — | orquestrador |

- Os 56 pulados: os 54 que já eram pulados na base, que só rodam com variável de ambiente, e 2 de desempenho local (`CRONOAI_PERF=1`).
- Corpus MSPDI: 419/419 em r01, r02 e r03 (`testes`).
- Cobertura de `src/lib` (stmts / branch / funcs / lines): r01 98,46 / 93,81 / 99,38 / 98,46; r02 98,47 / 93,91 / 99,39; r03 98,46 / 93,9 / 99,39 (`testes`); r04 98,46 / 93,92 / 99,39 / 98,46 (declarado pelo `dev-frontend`).
- **Gate de cobertura com todos os workers:** falha em testes antigos com teto de 5 s, só por carga da máquina (`testes` r01, nota 2: 4 timeouts — horizonte A3, premissas "frentes escolhidas", obras AC-10 ".xml exportado", parser S-1 "101 calendários" — e 1 "Timeout calling onTaskUpdate"; 1.138 passaram). Isolados com `--maxWorkers=1`, base × HEAD ficam parecidos: A3 3.546 × 2.433 ms; AC-10 815 × 965 ms; frentes escolhidas 1.811 × 1.800 ms; S-1 616 × 904 ms. **O gate verde é o de `--maxWorkers=2`.** Nas rodadas 02 e 03 só ele foi rodado.

### Testes existentes alterados (antes → depois)
Nenhuma asserção de número do Inviolável 1 mudou (entrega, d.u., SPI/CPI, crashing): `testes` r01, r02 e r03.

| Rodada | Teste | Antes | Depois |
|---|---|---|---|
| E1 a E4 | `migracaoEstado.test.ts` | `versaoEsquema` 5; esquema recusado 6 (3 ocorrências); cadeia `[[1,2],[2,3],[3,4],[4,5]]`; `expect(ESQUEMA_ATUAL).toBe(5)`; esquema 4 com `toEqual(estado)`; `criarRegistro(...).versaoEsquema` 5 | 6; esquema 7, com a mensagem "esquema 7"; cadeia com `[5,6]`; asserção removida; mesmo objeto mais `linhasBase: [LB0 migrada]`; 6 |
| E1 a E4 | `useProjectStore.obras.test.ts` | `versaoEsquema` 5 (3 pontos); esquema 6 recusado; registro real do esquema 4 com `toEqual(fx.registro.json)` | 6; esquema 7; mesmo objeto mais `linhasBase`; títulos ajustados |
| E1 a E4 | `msProjectXmlParser.test.ts` (C-5) | esperava o aviso "Linhas de base 1 a 10 não importadas…" | afirma as `linhasBase` lidas e a ausência do aviso (previsto no AC-6) |
| E1 a E4 | `evm.caracterizacao.test.ts` (C-2, desde o e126648) | `saveBaseline()` | `salvarLinhaBase({numero: 0, …, confirmarSobrescrita: true})`, com o mesmo valor esperado 6.496.233,42 |
| E1 a E4 | `msProjectXmlParser.corpus.test.ts` | — | só acrescenta métricas e asserções (400 lidas, 25, 77, comparador das LB1 a LB10); nenhuma removida |
| E1 a E4 | E2E `integracoes.spec.ts` P-2 | `versao: 2` | `versao: 3` |
| 02 | `fechamentos.test.ts`, `validarCabecalhosFechamento` | ids `['f1','f2']`, `ilegiveis` 4 | ids `['f1','f9','f2']`, `ilegiveis` 3, `repetidas` 2 |
| 02 | store: leitura adulterada | `fechamentosIlegiveis` 5; aviso "5 fechamento(s) ilegível(is)…" | 4; "4 fechamento(s) ilegível(is)…" (a sequência repetida foi para o teste do SEG-2) |
| 02 | store: fechar bloqueado | "Há 5 fechamento(s) ilegível(is)…" | "Há 4 fechamento(s) ilegível(is)…" |
| 02 | faixa da D-14 | "A obra mudou depois do fechamento de 23/10/2026: avance a data de status ou retifique o fechamento." | "A obra difere do fechamento efetivo de 23/10/2026: corrija a EAP, avance a data de status ou retifique o fechamento." |
| 02 | parser e corpus, aviso de LB0 sem datas (3 pontos) | "…calculou as datas da linha de base 0 delas." | "…calculou as datas e a duração da linha de base 0 delas." |
| 02 | `fechamentos.test.ts:82` e `:385` | `toBeDefined()` | `toEqual(obraNova.cabecalho)`; 20 tarefas e o valor lido (gravado + 0,004) |
| 03 | rede de segurança, mensagem (lib e store) | "…algum dado da obra (por exemplo, um código de EAP com mais de 200 caracteres)… Nada foi gravado." | "…o registro da tarefa UID 301 (EAP "02.01.999…") não passa na validação de leitura… Nada foi gravado." (na store, UID 2) |
| 03 | nota da LB do fechamento, LB inexistente | "a LB0 atual não é mais a mesma (foi trocada)." | "a LB0 do fechamento não existe mais." |
| 03 | desvio 9, aviso | termina em "…a exportação levará a data de início mantida." | acrescenta "A linha de base 0 que o arquivo não trazia foi calculada a partir da data de início mantida…" |
| 03 | desvio 9, LB0 calculada | todas as folhas com as datas definidas (`every(!== undefined)`) | datas exatas `[[2,'2026-05-04','2026-05-08'],[3,'2026-05-04','2026-05-08']]`; novo `delay.delayDays` = 159; LBs importadas sem `dataStatus` |
| 04 | `fechamentos.test.ts:426` | `(EAP "02.01.999…")` | `(código de EAP com 306 caracteres)`; asserções novas no mesmo teste: `toContain('o registro da tarefa UID 301 não passa')`, `not.toContain('texto-do-arquivo')` (declarado pelo `dev-frontend`) |
| 04 | `useProjectStore.fechamentos.test.ts:819` | `(EAP "1.999…")` | `(código de EAP com 302 caracteres)` (declarado pelo `dev-frontend`) |

### Desempenho
| Medida | Antes | Depois | Fonte |
|---|---|---|---|
| Edição de célula, 3.000 tarefas, mediana de 5 | 1,92–2,12 s (base) | 1,42–1,58 s | declarado pelo `dev-frontend` (r01; máquina a ~91% de CPU) |
| Troca da LB do valor agregado, sem fechamentos | 1,0 s (projeção por clone) | 0,27 s (dev); mediana 288 ms (`testes` r01) | dev; `testes` r01 |
| Troca da LB, 98 fechamentos | — | mediana 0,46 s (a 1ª, a fria, 1,27 s) | declarado pelo `dev-frontend` |
| Fechamento de ponta a ponta, 3.000 tarefas | 3,3–5,5 s (curva sem otimizar) | 1,64–2,53 s, mediana 1,87 s (dev); mediana de 5 de 1.480 ms (`testes` r01, `CRONOAI_PERF=1`) | dev; `testes` r01 |
| Abertura com 104 cabeçalhos + âncora | — | 65–91 ms (dev); 60 ms (`testes` r01) | idem |
| Detalhe do fechamento, 3.000 tarefas | — | ~213 mil caracteres (dev); 212.967 (`testes` r01) | idem |
| Registro da obra com a LB1 salva | — | 0,94 milhão de caracteres | `testes` r01 |
| Histórico de 156 registros | ADR estimava ~37 milhões | ≈ 33,3 milhões de caracteres | dev; `testes` r01 |

Depois da rede de segurança (031f156), que soma um `JSON.parse` do detalhe ao fechamento, o orquestrador no HEAD 2ab750b mediu de novo com `CRONOAI_PERF=1 npx vitest run src/lib/fechamentos.desempenho.test.ts` (5 de 5 passaram): fechamento de ponta a ponta com 3.000 tarefas 1366, 1119, 1392, 1518 e 1779 ms, **mediana 1.392 ms** (< 2.000); trocas de LB mediana 474 ms; abertura com 104 cabeçalhos + âncora em 57 ms; detalhe de 212.967 caracteres; 156 registros ≈ 33,3 milhões de caracteres. A rede de segurança não pôs a meta em risco.

### Matriz de verificação (gates reexecutados pelo `testes` em e99486a e pela auditoria r01 no HEAD 318a9f7, código = 2ab750b; `npm run ci` com todos os workers verde pelo orquestrador em f34214e)

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| G-LINT / G-TIPOS | eslint e vue-tsc | `npm run lint`, `npx vue-tsc --noEmit` | sim | PASS | EXIT 0 nos dois em r01 (6aeda18), r02 (031f156) e r03 (e99486a) (`testes`); `vue-tsc` exit 0 também pelo `arquiteto` em r01, r02 e r03; r04 (9a05047): OK, declarado pelo `dev-frontend` |
| G-COV / R-4 | Suíte completa e cobertura ≥ 80% | `npm run test:coverage -- --maxWorkers=2` | sim | PASS (com `--maxWorkers=2`) | r03 (e99486a, `testes`): 53 arquivos passaram, 2 pulados; 1.170 passaram, 56 pulados; exit 0; 98,46 / 93,9 / 99,39. Com todos os workers (r01, 6aeda18, nota 2): FAIL só por ambiente, 4 timeouts de 5 s e 1 erro `onTaskUpdate`, 1.138 passaram; isolados, base e HEAD parecidos. r04 (9a05047): 1.170 passaram, 56 pulados; 98,46 / 93,92 / 99,39 / 98,46, declarado pelo `dev-frontend` |
| G-E2E / R-5 | E2E; os existentes com os números da base | `CI=1 npm run e2e`, porta 4173 livre | sim | PASS | r01 (6aeda18): `41 passed (2.5m)`; só o `versao` da estrutura mudou, 2 → 3; r02 e r03 (e99486a): 41 passaram (`testes`); r04 (9a05047): `41 passed (2.5m)`, declarado pelo `dev-frontend` |
| G-BUILD | Build de produção | `npm run build` | sim | PASS | r01 "built in 20.21s"; r02 "built in 13.12s"; r03 (e99486a) "built in 25.65s" (`testes`); r04 (9a05047) "✓ built in 22.38s", declarado pelo `dev-frontend` |
| G-CORPUS / M-6 / AC-6 | Corpus MSPDI (Inviolável 2): inventário novo, sem perda de UID, vínculo, %, datas reais e LB0; ida e volta 95/95 | `msProjectXmlParser.corpus.test.ts` com `CRONOAI_REF_DIR` | sim | PASS | r01 (6aeda18): `419 passed (419)`; inventário 400 de 470, 25 tarefas em 7 arquivos, 77 valores em 7 arquivos; r02: 419/419, só o texto do aviso de LB0 sem datas mudou; r03 (e99486a): 419/419 (`testes`). r04: não rodado (declarado pelo `dev-frontend`) |
| G-REGRAS / R-1 | `validar-regras`; `src/lib` puro; sem `v-html` | `validar-regras.mjs --base feat/00006-sinapi-layout-2025 --commits` | sim | PASS | r01: 50 arquivos, 0 bloqueia, 0 alerta; r02 e r03 (e99486a): 54 arquivos, 0/0 (`testes`); `seguranca` r01 com `--base dd58ba9`: 0/0; r04: 54 arquivos, 0/0, declarado pelo `dev-frontend` |
| G-CLASSIF | Faixa | `classificar-diff.mjs --base feat/00006-sinapi-layout-2025 --commits` | sim | PASS | orquestrador no HEAD 2ab750b: "arquivos: 54 (código: 27)"; "Faixa exigida (mínima): 3 — T2, T3, T4"; "especialista-obra: OBRIGATÓRIO (T1/T2/T3)"; "seguranca: não exigido pela triagem" (a `seguranca` foi acionada pelo plano, por T4/T5 do IndexedDB e da exportação); exit 0. Revisar manualmente: `useProjectStore.ts` (T2/T4) |
| M-3 / C-4 | Exportação do seed igual à da base | teste de hash + diff do orquestrador (tarefa 27) | sim | PASS | `testes` r01: SHA-256 `a401d3a80ff304e097d8f7e1bc44312464c1055f91d95f45b0100c342c09e18e`, comprimento 79.670; o mesmo teste passa no e126648 (código igual à base) e em 6aeda18; não rodado no c06, que não tem o teste. r02: constantes inalteradas no diff. r03 (e99486a): passou. Script do dev contra dd58ba9 com datas normalizadas: "IGUAIS" nos 5 arquivos, declarado pelo `dev-frontend`. Diff do orquestrador previsto na tarefa 27: substituído pelo teste de hash; no HEAD 2ab750b: o teste "exportação do seed igual à da base 00006 (ciclo 00007, C-4 e M-3)" passa (mesmo comprimento e SHA-256 da base, `validateMspdi` com `strictOrder`), 1 passou e 79 pulados no filtro. O diff por arquivo da tarefa 27 foi substituído por esse teste, que compara o SHA-256 com o da base (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| N-4 | C-1 a C-5 e C-7 verdes antes da 1ª mudança | checkout do e126648 | sim | PASS | `testes` r01: worktree do e126648, 3 arquivos, 137 testes verdes (C-1, C-2/C-3, C-7, hash do seed, registro do esquema 5); o e126648 só tem testes, fixture e docs |
| N-1 a N-3 | Entrega 2027-06-23, +16 d.u.; 75% no 104 → 2027-06-16; crashing 3 d.u., R$ 12.616,80, 2027-06-18 | `useProjectStore.test.ts` (inalterado) | sim | PASS | `testes` r01: arquivo fora do diff, linhas 70 (2027-06-16) e 73–79 (12.616,8 / 2027-06-18) verdes; r02 e r03: 62 testes de C-1, C-7 e N-1 a N-3 verdes, arquivos não tocados |
| N-5 | FE-1, FE-3, LB-2 a LB-5, CS-1, CS-2, TE-1, DF-1 conferidos pelo `especialista-obra` | parecer da tarefa 0 + validação | sim | PASS | Tarefa 0: "confere" em FE-1, FE-3, LB-5, CS-1, CS-2, TE-1, DF-1; LB-2 "plausível". `especialista-obra` r01: todos recalculados à mão (`esp07\contas.mjs`), 144/144 testes focados; desvio 14 (folga do 302 = 26.534 min) recalculado sem o motor |
| AC-1 | Sem fechamento e com a LB0, nenhum número muda | `evm.caracterizacao` (C-1, C-7), N-1 a N-3, hash, "Aurora abre com a LB0" | sim | PASS | `testes` r01: todos verdes; o teste da LB0 afirma [19113000, 7259250, 6448200, 6896900]; r02 e r03: caracterização fora do diff e verde |
| AC-2 | Salvar LB 0 a 10; LB0 intacta; sobrescrita com confirmação; inclusão de escopo | LB-1, LB-6, S-1, D-35 | sim | PASS | `testes` r01: verdes; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-3 / R-6 | LB do valor agregado em PV, EV e BAC; atraso, cenários e DLP contra a LB0 | LB-2 a LB-5, R-6, teste 64; mutação (c) | sim | PASS | `testes` r01: a mutação (c), atraso pela LB do valor agregado, derruba R-6/LB-3 e P-11; `especialista-obra` r01: LB-3 +16 d.u. (01/06 → 23/06/2027), LB-4 BAC 18.993.000 e EAC 20.314.633,80, LB-5 EV 6.453.000 × 6.448.200; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-4 / P-1 a P-4 | v1 a esquema 5 abrem no 6; esquema 7 recusado; adulterado saneado | `migracaoEstado.test.ts`, `useProjectStore.obras.test.ts` | sim | PASS | `testes` r01: verdes; P-1 afirma o objeto inteiro mais a LB0 migrada. `testes` r03 (e99486a): saída da migração igual em 031f156 e no HEAD para v1, v1 com 75%, v2, esquemas 4 e 5 e 6 variantes; única diferença nos dumps de 362.626 bytes são ids aleatórios de log |
| P-1b | `undo` depois da migração | `useProjectStore.obras.test.ts` | sim | PASS | `testes` r01: entrega 2027-06-23 |
| AC-5 / M-1 / M-2 / M-5 | MSPDI com LBs e `BaselineForEarnedValue`, `strictOrder`, ida e volta | MS-1 a MS-3, testes 23 a 25 | sim | PASS | `testes` r01: verdes; `errors = []` afirmado; `especialista-obra` r01: `<Baseline>` em ordem crescente, filhos no `SCHEMA_ORDER.Baseline`; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-7 | Fechamento imutável, numa transação, com limites | FE-1, FE-2, FE-4, FE-6, FE-7 | sim | PASS | `testes` r01: verdes; EAC 20.442.984,04 e SPI 0,888274 nos testes; `especialista-obra` r01: FE-1 recalculado à mão; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-8 | Retificação com avisos | FE-3, FE-9 | sim | PASS | `testes` r01: EV 6.507.000 e os avisos afirmados; `especialista-obra` r01: FE-3 EV 6.456.600, AC 6.899.900, EAC 20.425.268,52; original testado byte a byte; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-9 / P-6 | Registros adulterados ignorados sem regravar | S-2 (`it.each`), P-6 | sim | PASS | `testes` r01: verdes; desde a r02 a sequência repetida deixa de ser ilegível (S-2 do plano mudou, ver Desvios) |
| AC-10 | Curva S de fechamentos, interpolação, *fallback*, pacote | CS-1 a CS-6 | sim | PASS | `testes` r01: CS-2 com exatamente 3 pontos; `especialista-obra` r01: CS-1 25k/50k/75k/100k; CS-2 EV 65.000 e AC 69.000; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-11 | Tendência pelos fechamentos | TE-1 | sim | PASS | `testes` r01: 0,894737 e 0,937931 afirmados; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-12 | Comparação entre dois fechamentos | DF-1 | sim | PASS | `testes` r01: verde; `especialista-obra` r01: +3 d.u., ΔEV +15.000, BAC 170k → 180k; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-13 / S-5 | Histórico em JSON, só com dados da obra | EX-1 | sim | PASS | `testes` r01: verde; `seguranca` r01: nome do arquivo sem *path traversal* nem controle (`../../etc/passwd` → `etc_passwd_historico_…`), blob local, nada pela rede; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-14 / P-10 / P-11 / P-12 | Desempenho | testes 51 a 53; local com `CRONOAI_PERF=1` | sim | PASS | `testes` r01 (6aeda18): mediana de 5 fechamentos 1.480 ms (< 2.000); troca de LB 288 ms (identidade de objetos); 104 cabeçalhos 60 ms; detalhe 212.967 caracteres. No CI: 600 tarefas e teto de 30 s (desvio 6). Depois de 031f156 (NB-1): no HEAD 2ab750b (depois da rede de segurança da r02): mediana de 5 fechamentos 1.392 ms; trocas de LB mediana 474 ms; abertura 57 ms; 156 registros ≈ 33,3 milhões de caracteres. A ressalva do teto do CI (600 tarefas, 30 s) segue registrada |
| AC-15 | Data de status não volta antes do último fechamento; import mantém a data | FE-5, D-13 | sim | PASS | `testes` r01: verdes; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| AC-16 | `CLAUDE.md`, regras e ADR 00002 | diff dd58ba9..HEAD | sim | PASS | `testes` r01: arquivos no diff; `arquiteto` r01: ADR com `fechamentos`/`fechamentoTarefas` e volume ≈ 33 milhões; R-3 (documentação) fechado na r02 (`arquiteto` r02) |
| AC-17 | `persist()` no 1º fechamento | FE-8 | sim | PASS | `testes` r01: 3 testes verdes; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| M-4 | `.xml` com LB1 a LB3 e `BaselineForEarnedValue` no MS Project real | conferência manual | não | NOT_RUN | Esperado; G5, G6, `Interim`, *rollup* e SPI ≈ 1,00 depois de salvar a LB sem conferência |
| P-5 | Estrutura 2 → 3: obra, índice e recorte intactos | E2E | sim | PASS | `testes` r01: `fechamentos.spec` P-5 verde; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| P-7 | Excluir e trocar de obra com fechamentos | store | sim | PASS | `testes` r01: verde; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| P-8 | Rollback: o app do 00006 cai na memória sem gravar | argumento | não | NA | `testes` r01: não verificável por teste |
| R-2 / S-3 | Nenhum `put` nas stores de fechamento | FE-4 + teste por texto; mutações | sim | PASS | `testes` r01: b1 (`put` no IndexedDB real) derruba o teste de R-2 por texto (o E2E passa com ela); b2 derruba o FE-4. O `ConstraintError` do IndexedDB real continua sem teste |
| R-3 | Gravação com `state.tasks`, nunca a projeção | teste + mutação a1 | sim | PASS | r01: só por revisão (a1 sobrevivia); `testes` r02 (031f156): o teste novo "R-3 / nota 1 dos testes" cai com a a1 |
| S-1 | Textos novos sem XSS e com limites | testes com `<script>`, `validar-regras` | sim | PASS | `seguranca` r01: sem `v-html`; limites 60/500/120/500/500; `testes` r01: verdes; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| S-2 | Matriz de recusas do cabeçalho e do detalhe | `fechamentos.test.ts` | sim | PASS | `testes` r01: `it.each` verdes; 8 MiB medidos antes do `JSON.parse`. Na r01 a escrita não respeitava a leitura (SEG-1); fechado na r02 |
| S-4 | Parser endurecido; 50 `<Baseline>` | testes do parser | sim | PASS | `seguranca` r01: DOCTYPE/ENTITY recusados antes do `DOMParser`; só os 11 primeiros `<Baseline>` lidos; avisos só com números; auditoria r01 no HEAD 318a9f7 (código = 2ab750b): passou na suíte com `--maxWorkers=2` (1.170 passaram, 56 pulados) e no E2E (41 passaram) |
| S-6 | Dependências | `auditar-dependencias.mjs` | sim | PASS | `testes` r01: produção 0/0/0/0; `package.json` e lock fora do diff; dev com os 2 críticos e 5 moderados conhecidos (vitest e tailwind) |
| SEG-1 | Fechamento só grava o que a leitura aceita | `useProjectStore.fechamentos.test.ts`, testes avulsos do `seguranca` | sim | PASS | `seguranca` r02 (031f156): TAB, aspas cp1252 e U+0085 → 2 legíveis, 0 ilegíveis; WBS + 300 → recusado, 0 gravados, obra continua fechável. `testes` r02: a3, a4 e (y) caem; `testes` r03 (e99486a): (x) cai com o teste de TAB e U+0085 no WBS |
| SEG-2 | Sequência repetida não bloqueia a obra | store + lib | sim | PASS | `testes` r02: a5 derruba 2 testes; `seguranca` r02: só cabeçalhos válidos entram no desempate; um forjado não ganha nada novo |
| SEG-5 / N-2 | Enter só nos campos longos | `linhasBase.test.ts`, store | sim | PASS | `seguranca` r02: só o `\n` liberado; "a\tb" recusado; `\r` solto recusado na leitura; `whitespace-pre-line` sem risco de XSS |
| LB0-META (ARQ R-1) | Salvar a LB0 de obra em branco + SINAPI | `SalvarLinhaBaseDialog.test.ts` | sim | PASS | `testes` r02: a2 derruba o teste; `arquiteto` r02: nenhum outro caminho grava a LB0 sem metadado |
| DESVIO-9 | Import mantém a data de início, com aviso e efeito na LB0 | `useProjectStore.fechamentos.test.ts:886` | sim | PASS | `testes` r03 (e99486a): LB0 `[[2,'2026-05-04','2026-05-08'],[3,…]]`, atraso 159, `<StartDate>2026-05-04T08:00:00`; `especialista-obra` r03: 04/05 a 08/05/2026, entrega 17/12/2026 e 159 d.u. iguais à conta à mão |
| NOTA-LB (ESP P-2) | Nota "fechado contra a LBk" percebe a troca por importação | store, `FechamentosPainel.test.ts` | sim | PASS | `especialista-obra` r02: "…LB0 de 27/04/2026; a LB0 atual é de 26/10/2026. O PV da curva é o da LB3."; `testes` r02: a7 cai; r03: "não existe mais" afirmado na lib e no painel (a12 cai, declarado pelo `dev-frontend`) |
| MODAL (N-1) | Foco inicial, trava, devolução; fundo não descarta o digitado | `ModalBase.test.ts` (5) | não | PASS | `testes` r02: a8, m1 e m2 caem; `seguranca` r02: Esc fecha de qualquer lugar, sem armadilha de teclado |
| N-3 / N-4 / N-10 | "lendo" × "erro"; reagendar a gravação; erro na prévia da retificação | `FechamentosPainel.test.ts`, store | não | PASS | `testes` r02: m3 cai; a6 cai (refeita até cair); 150% mostra o erro e 45% mostra 6.456.600,00 |
| N-5 | `ConstraintError` com o nome certo | revisão | não | PASS (revisão) | `arquiteto` r02: `(ev.target as IDBRequest)?.error` antes de `tx.error`; sem teste (jsdom) |
| TEXTOS | VIS-1, VIS-2, N-6, P-3, P-4, (c), (d), O-2 | E2E de texto, revisão | não | PASS | `especialista-obra` r02 e r03: textos corretos (opinião); r03: cartão "Pelo CPM" com "término da LB0: 01/06/27". O-2 (r04, 9a05047): sem teste dos textos do pacote nem do `{n}`, declarado pelo `dev-frontend` |
| WBS-MSG (NB-2, O-1) | Recusa aponta a tarefa sem texto livre do arquivo | `fechamentos.test.ts`, store | sim | PASS (r03); r04 sem validador | `arquiteto` r03 (e99486a): UID e WBS cortado, aviso de WBS > 200 no import só com números. r04 (9a05047): só UID e tamanho do WBS, asserções declaradas pelo `dev-frontend`, sem revalidação |
| NB-4 | Uma regra só para "a LB0 tem dado" | revisão + migração | não | PASS | `arquiteto` r03: migração sem mudança; muda só o `salvarLinhaBase` (LB0 só com término passa a pedir confirmação); `testes` r03: dumps iguais |
| MUT-GUARDAS | Guardas de obra da fila protegidas por teste | `mutar.cjs` (M1 a M6) | sim | PASS | `testes` r01 (6aeda18): as 6 reexecutadas, cada uma derruba 1 teste |
| MUT-R2 | Mutações da rodada 02 | `mutar2.cjs` (a1 a a8) + (x), (y), m1 a m3 | sim | PASS (r03) | `testes` r02 (031f156): a1, a3, a5, a6, a8 caem; (y) cai; m1 a m3 caem; (x) sobrevive. `testes` r03 (e99486a): (x) cai. a9 a a12: declarado pelo `dev-frontend` |
| V-1 | Diálogo de salvar LB e seletor da LB do valor agregado | `npm run dev` (:5184) | não | PASS | Orquestrador, 6aeda18: `role=dialog`, `aria-modal`, LB0 a LB10; confirmação ao escolher a LB0; "Informe o motivo da linha de base."; LB0: PV 7,26 mi, SPI 0,89; LB1: PV 6,50 mi, SPI 0,99; atraso +16 d.u. nas duas; orquestrador no HEAD 2ab750b: conferido de novo na tela, por script na página (:5184). "PELO CPM … o atraso é medido contra a LB0 (término da LB0: 01/06/27)"; faixa "A obra difere do fechamento efetivo de 23/10/2026: corrija a EAP, avance a data de status ou retifique o fechamento."; tendência "Índices gravados em cada fechamento · obra inteira". Diálogo de salvar LB: foco inicial no 1º campo (`lb-numero`) e, com Esc, o foco volta ao botão que abriu. Diálogo de retificar: a prévia mostra "O % físico precisa estar entre 0 e 100." com 150%, e o Esc devolve o foco; **o foco inicial cai no "Fechar"**, porque as tarefas carregam depois da abertura (V-6) |
| V-2 | Fechar e retificar | idem | não | PASS | Orquestrador, 6aeda18: prévia BAC 19.113.000,00, PV 7.259.250,00, EV 6.448.200,00, AC 6.896.900,00, entrega 23/06/2027 (+16 d.u.); 4 relatos pendentes; retificar 104 → EV 6.456.600,00, AC 6.899.900,00, EAC 20.425.268,52; selos "Retificação efetiva" e "Fechamento retificado" |
| V-3 | Curva S com ◆, pontilhado distinto da tendência, legenda e "Origem", temas claro e escuro | idem, captura | não | PASS (parcial) | Orquestrador, 6aeda18: legenda, aviso "reconstruído linearmente", coluna "Origem", Set/26 EV 5.408.856,76 (= CS-3b); `borderDash` e `[6, 5]`; temas renderizados. Pontilhado entre dois fechamentos não observado (só 1 fechamento) |
| V-4 | Tendência, entrega e comparação | idem | não | PASS | Orquestrador, 6aeda18: nº 1 → nº 2 EV +R$ 8.400,00, AC +R$ 3.000,00, 0 d.u.; "Avançaram (1)" 40% → 45%; linha "23/10/2026 retificação" com 23/06/2027, +16, 0,89 e 0,94 |
| V-5 | JSON exportado | conteúdo capturado na página | não | PASS | Orquestrador, 6aeda18: `Edificio_Residencial_Aurora_12_Pavimentos_historico_2026-10-23.json`, 6.145 caracteres, `formato` "cronoai-historico", `versao` 1, 2 LBs e 2 fechamentos com 20 tarefas cada |
| V-6 | Foco inicial do diálogo de retificar | script na página, orquestrador no HEAD 2ab750b | não | FAIL (Baixo, acessibilidade) | O `ModalBase` foca o 1º campo no `onMounted`; no `RetificarFechamentoDialog` as linhas de tarefa só aparecem depois da leitura do detalhe, e o foco cai no "Fechar". Pendência registrada (focar o 1º campo quando o detalhe termina de carregar) |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | PASS (reauditoria) | r01 (318a9f7, código = 2ab750b): REPROVADO (registro e CI sem prova; código e gates obrigatórios PASS). lint exit 0; vue-tsc exit 0; `test:coverage -- --maxWorkers=2` 53 arquivos passaram e 2 pulados, 1.170 testes passaram e 56 pulados, 98,46 / 93,93 / 99,39 / 98,46; com todos os workers, 1 falha por teto de tempo em teste antigo (S-1 "101 calendários", 2.079 ms > 2.000; isolado 572–897 ms); `CI=1 npm run e2e` 41 passed (2.5m); build "✓ built in 19.14s"; corpus 419/419; validar-regras "55 arquivo(s) … 0 bloqueia, 0 alerta"; classificar-diff "Faixa exigida (mínima): 3 — T2, T3, T4"; `npm run ci` exit 1 (`cpm.desempenho` 2.410 ms > 2.000; isolado 368 ms); `CRONOAI_PERF=1` mediana de 5 fechamentos 1.443 ms; 44 de 55 evidências conferidas (N-5, MUT-GUARDAS e MUT-R2 INCONCLUSIVE para a auditoria, porque dependem de scripts e contas fora do repositório). Achados: 1 Médio (CI do PR sem prova de verde) e 3 Baixos (coerência do registro). Reauditoria (4189bb1, delta 318a9f7..4189bb1, só registro; `src`, `e2e` e `package*` sem diff): APROVADO. Os 3 Baixos foram corrigidos no registro. O Médio fechou pelo `npm run ci` do orquestrador com todos os workers (f34214e, saída bruta conferida): "Test Files 53 passed \| 2 skipped (55)", "Tests 1170 passed \| 56 skipped (1226)", 98,46 / 93,92 / 99,39 / 98,46, "✓ built in 15.19s", exit 0. A reexecução da auditoria com a máquina carregada deu exit 1 só por tempo, sem regressão ("Tests 10 failed \| 1160 passed": 2 tetos de 2.000 ms e 8 timeouts de 5 s, 2 deles em testes do ciclo, `useProjectStore.linhasBase.test.ts` R-6/LB-3 e teste 68, que levam de 1,0 a 1,7 s isolados). O gate depende da carga da máquina; o CI do GitHub no PR é a confirmação final |

## Números que mudaram de propósito (antes → depois)
Com a LB0 e sem fechamento, nada muda (AC-1). As mudanças abaixo valem para obra com fechamento, com outra LB do valor agregado, para arquivos importados, ou são só de texto e exibição.

**E1 a E4 (dd58ba9 → 6aeda18)**
| O quê | Antes | Depois |
|---|---|---|
| Corpus: `<Baseline>` 1 a 10 lidos | 0 de 470, com o aviso "não importadas" em 470 tarefas de 7 arquivos | **400 de 470** (custo 70, duração 110, início 110, término 110); os 70 restantes só têm `Work` (`testes` r01: 400 de 470) |
| Corpus: `Work` das LBs | não avisado | aviso único: 77 valores em 7 arquivos |
| Corpus: LB0 sem datas | calculada sem aviso | 25 tarefas em 7 arquivos, com aviso |
| Corpus: ida e volta com `strictOrder` | 95 de 95 | 95 de 95, comparando também as LB1 a LB10 das folhas (declarado pelo `dev-frontend`) |
| Tabela da Curva S (desvio 10) | `fmtBRL`: "R$ 6.448.200" | `fmtBRLCents`: "R$ 6.448.200,00" |
| Curva S de obra com fechamento | reconstrução linear em todos os meses | ponto do fechamento com o EV e o AC gravados; meses anteriores ancorados (CS-3b: Set/26 5.408.856,76 com o fechamento, 5.396.674,21 sem) |
| PV com a LB1 do valor agregado (C-2, regra do CronoAI) | — (só LB0) | 6.496.233,415 (SPI 0,992606); o atraso continua +16 d.u. |
| Esquema do estado / estrutura do IndexedDB | 5 / 2 | 6 / 3 |
| Salvar a LB0 de novo | `saveBaseline()` sem confirmação | `salvarLinhaBase` exige `confirmarSobrescrita` (desvio 13) |
| Edição de célula com 3.000 tarefas | 1,92–2,12 s | 1,42–1,58 s (declarado pelo `dev-frontend`) |
| Fechamento de ponta a ponta, 3.000 tarefas | 3,3–5,5 s (curva sem otimizar) | mediana 1,87 s (dev); 1.480 ms (`testes` r01) |
| Valores do plano corrigidos pela medição (desvio 14) | início real do 104 suposto em 2026-09-25 | 2026-10-05; folga do 302 26.534 min; PV do 104 na LB0 R$ 168.000,00 (conferidos pelo `especialista-obra` r01) |

**Rodada 02 (6aeda18 → 031f156):** nenhum número exibido mudou, só texto (`testes` r02 pelo diff e pela caracterização).
| Caso | Antes | Depois |
|---|---|---|
| Leitura adulterada (store) | 5 ilegíveis | 4 (a sequência repetida deixou de ser ilegível: SEG-2) |
| Duas abas gravando a mesma sequência | 1 ilegível; obra bloqueada para sempre | 0 ilegíveis; efetivo pelo `fechadoEm` e depois pelo `id`, com aviso; a obra continua fechável |
| `.xml` com TAB no nome do pacote ou WBS de 70 caracteres | fecha e vira ilegível ao reabrir | fecha e reabre com 0 ilegíveis; WBS acima de 200 é recusado antes de gravar |
| Faixa da D-14 depois da retificação | "A obra mudou depois do fechamento…: avance a data de status ou retifique o fechamento." | "A obra difere do fechamento efetivo…: corrija a EAP, avance a data de status ou retifique o fechamento." |
| Aviso de LB0 sem datas | "calculou as datas" | "calculou as datas e a duração" |
| Índices da tendência com fechamentos | "Índices acumulados mês a mês"; "No último mês…" | "Índices gravados em cada fechamento"; "Entre os dois últimos fechamentos" |
| SV, CV, ETC e TCPI do ponto selecionado | sem rótulo | "· obra na data de status" quando o ponto não é o atual (valores iguais) |
| Cartões de término | sem a LB | dizem a LB que usam; o do CPM diz "o atraso é medido contra a LB0" |
| Motivo e observação com Enter | recusados como caractere de controle | aceitos (`\n`), exibidos com `whitespace-pre-line` |
| LBs importadas | sem `salvaEm`: a nota "fechado contra" não percebia a troca | `salvaEm` = hora da importação; a nota avisa |

**Rodada 03 (031f156 → e99486a):** nenhum número exibido mudou; o término da LB0 no cartão "Pelo CPM" já era calculado.
| Caso | Antes | Depois |
|---|---|---|
| Desvio 9 no teste (fixture com início 01/12 e status 10/12/2026, data mantida 04/05/2026) | LB0 calculada só afirmada como definida | LB0 de 04/05 a 08/05/2026 nas tarefas 2 e 3; atraso **159 d.u.**; entrega 17/12/2026. Com a data de início do arquivo, a LB0 iria de 01/12 a 07/12 e o atraso seria de 8 d.u. (`especialista-obra` r02: PV 1.500, EV 0, SPI 0,00) |
| Aviso do desvio 9 | "…a exportação levará a data de início mantida." | acrescenta que a LB0 foi calculada a partir da data mantida e que o PV e o atraso dessas tarefas não refletem o arquivo |
| Mensagem da rede de segurança | "algum dado da obra (por exemplo, um código de EAP com mais de 200 caracteres)" | UID e WBS cortado em 40 caracteres |
| Import com WBS acima de 200 | sem aviso | "1 tarefa(s) com código de EAP (WBS) acima de 200 caracteres…" |
| Nota da LB inexistente | "a LB0 atual não é mais a mesma (foi trocada)." | "a LB0 do fechamento não existe mais." (também no painel) |
| LBs importadas | `dataStatus` = data de status do arquivo | sem `dataStatus` |
| Salvar a LB0 que só tem término | sem confirmação na store | pede confirmação (regra única `temDadoLb0`) |

**Rodada 04 (e99486a → 9a05047, declarado pelo `dev-frontend`, sem revalidação):** a mensagem da rede de segurança deixa de mostrar o WBS: "o registro da tarefa UID 301 (código de EAP com 306 caracteres) não passa…", ou só o UID quando a causa não é o tamanho. No recorte por pacote, o subtítulo da tendência passa de "Índices gravados em cada fechamento" para "Índices dos fechamentos", e a nota de "Recorte por pacote: índices dos fechamentos (PV da LB vigente)." para "PV da LB{n} do valor agregado atual". Na obra inteira, nada muda.

## Desvios do plano

Avaliação do `arquiteto` r01 para os desvios 1 a 15 do `dev-frontend`; os demais vêm das rodadas 02 a 04.

| # | Desvio | Avaliação |
|---|---|---|
| 1 | Referências de linha do plano deslocadas (`useProjectStore.ts` com 2.387 linhas na base) | Aceito |
| 2 | Esquema 5 → 6 e estrutura 2 → 3, estendendo a interface do 00006 | Aceito (emenda 02, D-20) |
| 3 | Fechamento gravado por `ExtrasDeGravacao.gravarFechamento` do `gravarObra`, não por método próprio (D-21); entraram `lerCabecalhosFechamento`, `lerDetalheFechamento` e `persistir` | Aceito com registro: uma transação só, regras conferidas de novo na fila, guardas de obra |
| 4 | Saneamento das LBs em `sanearLinhasBaseDoEstado` (via `levarAoAtual`), não em `completarChaves`; dado de LB sem metadado é descartado com aviso | Aceito com registro; o descarte vira dívida, com a recomendação N-9 (metadado provisório) |
| 5 | Arquivo novo fora do plano: `src/components/common/ModalBase.vue` | Aceito com registro: não havia diálogo reutilizável |
| 6 | `fechamentos.desempenho.test.ts` no E4; no CI, 600 tarefas e teto de 30 s (o plano pedia 6 s com 3.000) | Aceito com registro (`testes.md`); a guarda do CI quase não discrimina (`testes` r01, nota 3) |
| 7 | `computeSCurve` otimizado, fora do plano | Aceito: os números não mudam (C-1 e CS-4 verdes) |
| 8 | `Interim = 1` fora da busca da LB0 | Aceito com registro; `msproject-mspdi.md:46` atualizado na r03 (NB-5) |
| 9 | O import mantém a data de início da obra, com aviso, se a do arquivo for posterior ao 1º fechamento | Aceito com registro (D-13); teste entrou na r02 e foi fixado na r03 (159 d.u.) |
| 10 | Tabela da Curva S com `fmtBRLCents` | Aceito |
| 11 | E2E `integracoes.spec.ts` P-2: `versao` 2 → 3 | Aceito |
| 12 | Testes existentes alterados pelo esquema 6 | Aceito (mudanças mecânicas; C-2 manteve 6.496.233,42) |
| 13 | Salvar a LB0 de novo exige `confirmarSobrescrita` | Aceito |
| 14 | Valores do plano corrigidos pela medição (104, 302) | Aceito; conferidos à mão pelo `especialista-obra` r01 |
| 15 | Comparador "duração da LB0" retirado da ida e volta do corpus | Aceito: nunca existiu em dd58ba9; a LB0 sem datas ganhou aviso |
| N-7 | `msProjectTasks` passou a usar a projeção no BAC, PV e EV (não declarado pelo dev) | Aceito pelo `arquiteto` r01; registrado em `divida-conhecida.md` |
| S-2 (r02) | Sequência repetida deixa de ser ilegível e desempata por `fechadoEm` e `id`; o plano dizia `sequencia` "única" | Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR. Registrado em `divida-conhecida.md`; sem emenda do plano |
| WBS (r02) | Limite próprio de WBS de 200 caracteres na escrita e na leitura; o plano pedia "coerente com o maior WBS que o estado e o parser aceitam" e ambos aceitam qualquer tamanho; o valor foi escolhido pelo `dev-frontend` | Aceito pelo `arquiteto` r02 (corpus: no máximo 3 caracteres em 2.615 `<WBS>`). Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| Enter (r02) | `\n` aceito nos campos longos, contra a recusa de controle da §08 | Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| Rótulo (r02) | "obra na data de status" em SV, CV, ETC e TCPI | Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| `salvaEm` / `dataStatus` (r02, r03) | LBs importadas com `salvaEm` = hora da importação (r02) e sem `dataStatus` (r03; reverte um detalhe da r02) | Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| `temDadoLb0` (r03) | Regra única; o `salvarLinhaBase` passa a olhar início OU término | Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR; migração sem mudança (`testes` r03, `arquiteto` r03) |
| Mensagem (r03, r04) | Na r03, UID e WBS cortado; na r04, só UID e tamanho (regra de `msproject-mspdi.md`: texto livre do arquivo fora de avisos e erros) | Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR. O `arquiteto` r03 aceitava o WBS na mensagem e o `especialista-obra` r03 apontou a regra; o `seguranca` não foi consultado |
| Rodada 04 | 2 textos sem revalidação | Decisão do orquestrador (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR); a auditoria r01 reexecutou os gates no HEAD e conferiu as asserções da r04 (`fechamentos.test.ts:421-436`, `useProjectStore.fechamentos.test.ts:819`) |
| Registro do ciclo | Escrito depois da rodada 04 | Desvio de processo registrado |

## Ressalvas dos validadores e destino
| Origem | Ressalva | Destino |
|---|---|---|
| seguranca r01 SEG-1 (Alto, bloqueante) | Fechamento gravado sem o validador da leitura (WBS sem limite, nome do pacote com controle): obra bloqueada para sempre | corrigido (031f156): `limparControles`, limite de WBS 200 nos dois lados e rede de segurança `erroDeGravacaoDoRegistro` no fechar e no retificar; confirmado pelo `seguranca` r02 |
| seguranca r01 SEG-2 (Baixo) | Sequência repetida (duas abas) vira ilegível e bloqueia a obra | corrigido (031f156): desempate com aviso |
| seguranca r01 SEG-3 (Info, Jurídico) | Autor pré-preenchido com `meta.manager` vai ao registro imutável e ao JSON | dívida registrada; pendência do Jurídico |
| seguranca r01 SEG-4 (Info) | `excluirObra` grava fora da fila | dívida do 00006, já registrada |
| seguranca r01 SEG-5 (Info) | Enter nos `textarea` recusado | corrigido (031f156) |
| arquiteto r01 R-1 (bloqueante) | Diálogo trava ao salvar a LB0 de obra com dado e sem metadado (regressão) | corrigido (031f156): metadado na inclusão por SINAPI e planilha; diálogo trata a LB0 com dado como existente |
| arquiteto r01 R-2 (bloqueante) | Desvio 9 sem teste | corrigido (031f156); datas fixadas em e99486a |
| arquiteto r01 R-3 (bloqueante) | Documentação (`persist()`, desvios 4, 6 e 9) | corrigido (031f156): `divida-conhecida.md`, `testes.md`, `msproject-mspdi.md` |
| arquiteto r01 N-1 | `ModalBase`: foco, trava, devolução, fundo | corrigido (031f156) |
| arquiteto r01 N-2 | Enter nos `textarea` | corrigido (031f156) |
| arquiteto r01 N-3 | Painel em "Lendo…" para sempre com erro | corrigido (031f156) |
| arquiteto r01 N-4 | Reagendar a gravação recusada na fila | corrigido (031f156) |
| arquiteto r01 N-5 | `tx.error` nulo no `onerror` | corrigido (031f156), sem teste (jsdom) |
| arquiteto r01 N-6 | "mês a mês" e "último mês" com fechamentos | corrigido (031f156) |
| arquiteto r01 N-7 | `msProjectTasks` com projeção, não declarado | aceito e registrado |
| arquiteto r01 N-8 | `persistenciaPedida` só na sessão | registrado |
| arquiteto r01 N-9 | Metadado provisório em vez de descarte | dívida registrada |
| arquiteto r01 N-10 | Erro da prévia da retificação só ao gravar | corrigido (031f156) |
| especialista r01 P-1 (bloqueante) | Teste do desvio 9 | corrigido (031f156 e e99486a) |
| especialista r01 P-2 (bloqueante) | Nota "fechado contra a LBk" não percebe a importação | corrigido (031f156): regra "sem `salvaEm` = diferente" e `salvaEm` no import |
| especialista r01 P-3 (opinião) | "as datas e a duração" | corrigido (031f156) |
| especialista r01 P-4 (opinião) | Cartões de término sem a LB | corrigido (031f156); término da LB0 no cartão CPM em e99486a |
| testes r01 nota 1 | R-3 sem teste (a1 sobrevive) | corrigido (031f156); confirmado pelo `testes` r02 |
| testes r01 nota 2 | Gate com todos os workers falha por timeout | registrado: ambiente; gate verde com `--maxWorkers=2` |
| testes r01 nota 3 | Guarda de desempenho do CI fraca | registrado em `testes.md` |
| testes r01 nota 4 | `toBeDefined` e R-2 por texto | `toBeDefined` corrigidos (031f156); R-2 por texto continua contornável (registrado) |
| verificação visual VIS-1 | Faixa da D-14 sugere retificar de novo | corrigido (031f156): cita a EAP |
| verificação visual VIS-2 | SV, CV, ETC e TCPI vivos ao lado de PV/EV/AC gravados | corrigido (031f156): rótulo, sem mudar número |
| verificação visual VIS-3 (Info) | Tendência começa no EV vivo | registrado em `divida-conhecida.md` |
| verificação visual VIS-4 (Info) | Tendência com 1 ponto | textos ajustados (031f156) |
| verificação visual VIS-5 | Foco não volta ao fechar o diálogo | corrigido (031f156) = N-1; conferido na tela pelo orquestrador em 2ab750b (V-1): foco inicial no 1º campo do diálogo de salvar LB e foco devolvido com Esc. O diálogo de retificar ficou com o foco inicial no "Fechar" (V-6, pendência) |
| testes r02 nota 1 | Mutação (x) sobrevive | corrigido (e99486a); `testes` r03 confirma |
| testes r02 nota 2 | S-2 do plano mudou | registrado (ver Desvios) |
| testes r02 nota 3 | Retificar sem teste da rede; `ConstraintError` sem teste | registrado em `divida-conhecida.md` |
| arquiteto r02 NB-1 | Medir o desempenho de novo depois da rede de segurança | medido pelo orquestrador no HEAD 2ab750b: mediana 1.392 ms (< 2.000) |
| orquestrador (conferência visual, 2ab750b) | V-6: foco inicial do diálogo de retificar no "Fechar" (conteúdo carregado depois da abertura) | pendência registrada (Baixo, acessibilidade) |
| arquiteto r02 NB-2 | Mensagem de recusa sem a tarefa; WBS não editável na tela | corrigido (e99486a e 9a05047) |
| arquiteto r02 NB-3 | TAB no WBS tira o fechamento da curva do pacote | registrado (corpus com 0 casos) |
| arquiteto r02 NB-4 | Duas regras para "a LB0 tem dado" | corrigido (e99486a) |
| arquiteto r02 NB-5 | `Interim` na LB0 sem registro | corrigido (e99486a) |
| especialista r02 R-1 (bloqueante) | LB0 calculada só afirmada como definida | corrigido (e99486a): datas e 159 d.u. |
| especialista r02 R-2 (opinião) | Aviso sem o efeito na LB0 | corrigido (e99486a) |
| especialista r02 (opinião) | `dataStatus` nas LBs importadas; "não existe mais"; cartão CPM; legenda por pacote | corrigidos (e99486a) |
| seguranca r02 (Info) | Cabeçalho forjado numa data posterior pelo desempate | registrado: exige acesso ao IndexedDB; não abre caminho novo |
| seguranca r02 (Info) | U+2028 e U+202E nos textos livres | registrado em `divida-conhecida.md` |
| arquiteto r03 (observação) | `keysBaseline` opcional: texto com traço numa obra sem LB0 | não conferido na tela (ver Pendências) |
| especialista r03 O-1 | WBS do arquivo na mensagem, contra `msproject-mspdi.md` | corrigido (9a05047), sem revalidação |
| especialista r03 O-2 | Subtítulo e nota do pacote se contradizem | corrigido (9a05047), sem revalidação e sem teste dos textos do pacote |
| especialista r03 O-3 (opinião) | Frase do desvio 9 imprecisa com LB0 só de custo ou duração | aceito como está |

## Pendências registradas
- **V-6 (acessibilidade, Baixo):** no diálogo de retificar, o foco inicial cai no "Fechar", porque as linhas de tarefa carregam depois da abertura. Correção: focar o 1º campo quando o detalhe termina de carregar.
- **Auditoria independente:** r01 REPROVADO só por registro e pelo CI; reauditoria (4189bb1) APROVADO. **Prova do gate do PR:** o orquestrador rodou `npm run ci` (todos os workers) em f34214e (código = 2ab750b), com a máquina menos carregada: "Test Files 53 passed | 2 skipped (55)", "Tests 1170 passed | 56 skipped (1226)", cobertura 98,46 / 93,92 / 99,39 / 98,46, "✓ built in 15.19s", exit 0. O CI do GitHub do PR segue como confirmação. Na máquina carregada, testes antigos com teto interno de 2.000 ms (`cpm.desempenho`, S-1 "101 calendários") falham de forma intermitente; isolados levam 368 a 897 ms. **Com a máquina muito carregada e todos os workers, o timeout padrão de 5 s do Vitest também derruba testes de store deste ciclo** (R-6/LB-3 e teste 68, de 1,0 a 1,7 s isolados): se o CI do GitHub falhar por tempo, rodar de novo antes de investigar.
- **Desempenho depois da rede de segurança (NB-1):** medido duas vezes no código final: pelo orquestrador em 2ab750b (mediana 1.392 ms) e pela auditoria r01 em 318a9f7 (mediana 1.443 ms), abaixo dos 2.000 ms do RNF-04.1. Resta só a guarda do CI, mais fraca que a do plano (600 tarefas, 30 s).
- **Textos da r04 sem teste:** subtítulo e nota da tendência no recorte por pacote e o `{n}` da LB ativa.
- **Rede de segurança no retificar** sem teste; **`ConstraintError` do IndexedDB real** sem teste (o E2E passa com a mutação b1).
- **Teste de R-2 por texto** (nenhum `put`) contornável por variável intermediária.
- **Gate de cobertura com todos os workers:** testes antigos com teto de 5 s falham com a máquina carregada; rodar de novo numa máquina livre.
- **Verificação visual:** V-1 a V-5 feitos em 6aeda18 e conferidos de novo pelo orquestrador em 2ab750b nos pontos que mudaram (cartão "Pelo CPM" com o término da LB0, faixa da D-14, tendência da obra inteira, foco e Esc dos diálogos, erro da prévia da retificação). **Não vistos na tela:** os textos do recorte por pacote da r04 (O-2, também sem teste), o pontilhado entre dois fechamentos e o `keysBaseline` sem LB0.
- **M-4:** `NOT_RUN`. G5, G6, `Interim`, *rollup*, sobrescrita e SPI ≈ 1,00 depois de salvar a LB.
- **M-3, diff do orquestrador (tarefa 27):** sem evidência; só o teste de hash e o script do dev.
- **Mudanças de regra sem emenda do plano:** S-2 (sequência repetida) e o limite de WBS de 200.
- **Dívidas do ciclo** (`.claude/rules/divida-conhecida.md`, seção "Dívida do ciclo 00007"):
  - custo da LB0 acompanha o `bac` vivo, enquanto as LB1 a LB10 congelam o custo;
  - duração da LB gravada como vão; `Duration` 0 da LB0 do resumo;
  - PV linear entre início e término da LB (regra do CronoAI);
  - hora das datas e `Work` da LB não voltam ao `.xml`; LB0 sem datas calculada;
  - G5 = b com o texto do RF-04.5 desatualizado;
  - histórico só no navegador, limite de 104 + 52, sem excluir, arquivar nem importar o JSON;
  - `criarObra`, `duplicarObra` e `excluirObra` com o índice fora da fila (herdada do 00006);
  - descarte de LB sem metadado (desvio 4; recomendação N-9);
  - import mantém a data de início (desvio 9);
  - `msProjectTasks` com a projeção (N-7);
  - `persist()` pedido uma vez por sessão (N-8);
  - autor pré-preenchido com o responsável (SEG-3);
  - TAB no WBS tira o fechamento da curva do pacote (NB-3);
  - U+2028 e U+202E nos textos livres; cabeçalho forjado exige acesso ao IndexedDB;
  - S-2 do plano alterado; retificar sem teste da rede; `ConstraintError` sem teste;
  - tendência a partir do EV vivo (VIS-3).
- **Antes do PR:** PR empilhado em `feat/00006-sinapi-layout-2025` se o 00006 não tiver entrado na `master`. Recomendar exportar o `.xml` e o JSON das obras antes de atualizar (o app do 00006 recusa o esquema 6).

## Validação de outras áreas (não substitui o parecer delas)
- **Planejamento/Controle** (antes do piloto; não bloqueia o merge):
  - rotina de fechamento: semanal ou mensal, quem fecha, retificação e data de status;
  - atualizar o texto do RF-04.5 (G5 = b: LB do valor agregado; variações contra a LB0);
  - E-2 (custo da LB n = `bac` do momento; tarefa sem LB n com BAC, PV e EV zero e AC contando) e E-7 (inclusão de escopo na LB ativa), junto com Orçamento/Controladoria;
  - série de PV da LB0 como referência e seletor "comparar variações com a LB0 ou a LBn" (fora do escopo);
  - retificar datas reais (fora do escopo);
  - abrir no MS Project real o `.xml` com LB1 a LB3 (M-4; o usuário, não bloqueia o merge).
- **Orçamento/Controladoria** (antes do piloto):
  - custo da LB n e tarefa sem LB n (E-2); custo vivo da LB0;
  - arredondamento de R$ (pendência já registrada, lembrada pelo `especialista-obra` r01).
- **Jurídico:**
  - texto "Registro gerencial; não substitui a medição contratual" (antes do piloto);
  - autor como texto livre (nome de pessoa) no fechamento, na LB e no JSON exportado, pré-preenchido com o responsável da obra (LGPD, retenção e eliminação; antes de abrir para clientes; SEG-3);
  - guardar no navegador o "já pedi" do armazenamento persistente (N-8), junto com a Infraestrutura.
- **Infraestrutura** (antes do uso real, Fase 2):
  - durabilidade do histórico só no navegador ("best-effort") e o limite de 104 fechamentos; persistência no servidor na SPEC-01.
- **Segurança da Informação:** não exigida pelo plano (§08: sem superfície nova em produção). O `seguranca` conferiu S-1 a S-6. Referência (prática documentada): [OWASP Prototype Pollution Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html); [MDN `IDBObjectStore.add`](https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/add) (G1); [WAI-ARIA APG, diálogo modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) e [WCAG 2.1.2](https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html) (boa prática, `ModalBase`).
