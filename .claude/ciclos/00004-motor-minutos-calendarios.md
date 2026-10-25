---
issue: —
spec: SPEC-05 parte 1 (RF-05.1, RF-05.2 por tarefa, RF-05.3, RF-05.4, RF-05.5, RF-05.8); herdados do 00003 (H1–H4); CR-11/CR-12
branch: feat/00004-motor-minutos-calendarios
base: feat/00002-multiobra + merge de feat/00003-corpus-mspdi (616dad7)
faixa: 3 (T1, T2, T3, T4; T6 só renomeação)
ficha_ou_plano: .claude/ciclos/00004-motor-minutos-calendarios-plano.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00004 — Motor em minutos, calendários, restrições, lag, progresso e divergências

## Resumo
- **O que é:** o motor do cronograma passa a trabalhar em minutos inteiros (ADR 00003). Ganha:
  - vários calendários por obra e calendário por tarefa;
  - as 8 restrições, sempre honradas, e prazo final;
  - lag em dias úteis, corridos e %, e duração corrida;
  - lógica retida × substituir progresso, mover o restante e restante exato;
  - MSPDI de ida e volta com calendários, `CalendarUID`, restrições, `Deadline`, todos os `LagFormat`, `Manual`/`Active` e Move*;
  - painel "Divergências com o MS Project", edição de restrição, prazo e calendário na EAP;
  - proteção do horizonte de 50 anos: nada derruba a tela, e o import é recusado antes de gravar.
- **Decidido pelo orquestrador**, com a autorização do usuário para seguir sem parar e **sujeito à revisão dele no PR**:
  - gate: P1 = calendário da **sucessora** (Emenda 01, após a tarefa 0); P2 = sempre honrar as restrições; P3 = minuto inteiro;
  - aceitar a edição de célula acima da meta de desempenho (ver "Dívida aceita", D-ed);
  - emenda 02, abaixo (calendário só com exceção útil é recusado).
- **Números do Edifício Aurora:** entrega 2027-06-23, 16 d.u., SPI 0,8883, CPI 0,9349 — **iguais**. Todas as mudanças de propósito estão na seção "Números que mudaram", com antes → depois.
- **O que você precisa fazer:**
  - revisar no PR as decisões acima e a mudança de suprimentos causada pelo restante exato;
  - levar à **Engenharia de planejamento** a conferência no MS Project real (M-5/M-6).
- **Estado:** aprovado. Validadores e auditoria independente aprovados (34bd885). Antes do merge, o usuário decide sobre a D-ed, as emendas 02 e 03 e as dívidas R-F e R-C.

## Pedido
"Pode fazer todas as fases" → PLANO-FASE-1 §3.4, ciclo 00004.

## Triagem
- **T1, T2:** `cpm.ts`, `calendarioTrabalho.ts`, `evm.ts`, `scenarios.ts`.
- **T3:** parser MSPDI.
- **T4:** esquema 2 → 3, com o `undo` de cada obra.
- **T6:** só renomeação em `fieldAi.ts`.
- **T5:** endurecimentos contra arquivo externo.
- **Faixa 3.** O `classificar-diff` confirma T1–T4 e T6; `especialista-obra` obrigatório.

## Tarefa 0 e emendas
- **Tarefa 0:** feita pelo `especialista-obra` (`.claude/ciclos/00004-tarefa0-especialista.md`).
- **Emenda 01** (no plano): P1 = calendário da sucessora; 11 correções; H1–H4.
- **Emenda 02 (25/10/2026, orquestrador, sujeita à revisão do usuário no PR):**
  - O plano (§03, §08) só recusava calendário sem minuto útil na semana **e** sem exceção útil.
  - Na rodada 02, a pedido do `arquiteto` (M1: laço sem fim no `WorkCalendar`) e da `seguranca`, passa a ser recusado com aviso também o calendário cuja semana não tem tempo útil, **mesmo com exceções úteis**. As tarefas desse calendário passam ao calendário do projeto.
  - Motivo: segurança (evita laço e horizonte estourado); o caso não aparece no corpus.
  - Testes: `calendarioTrabalho.test.ts:213-217`, `msProjectXmlParser.test.ts` caso "G".
- **Emenda 03 (25/10/2026, orquestrador, sujeita à revisão do usuário no PR):**
  - Obra salva com `meta.startDate`/`meta.statusDate` inválidos passa a ser **ilegível** na migração (rodada 03, pedido da `seguranca`). Antes abria; inclui a chave v1 sem data de início.
  - O registro fica intacto, sem gravação por cima.
  - O caminho de recuperação ("abrir em modo corrigir datas") fica como dívida (R-C do `especialista-obra`). Só ocorre com estado adulterado, porque os formulários validam as datas.

## Commits
| SHA | Conteúdo |
|---|---|
| d68a6f0 | Plano, parecer da tarefa 0 e ADR 00003 |
| 78d905e | E1: motor em minutos, calendários, calendário por tarefa, migração 2 → 3, CR-11, CR-12 |
| 2fd0195 | E2: restrições, prazo, lag corrido e %, opções de progresso, restante exato |
| 3ac4365 | E3: MSPDI de ida e volta |
| 68a9401 | E4: painel de divergências, edição na EAP, opções de cronograma, E2E |
| 875c518 | Rodada 02 (itens A–O dos validadores) |
| 20e01fa | Rodada 03 (ressalvas da rodada 02) |
| e8b4dae | Rodada 04 (achados da auditoria + R-A, R-B, R-D do `especialista-obra`) |
| 255dca3 | Rodada 05: R-E (24:00 em todo campo de data-hora do export e no término de tarefa comum; import normaliza o 00:00 para reimportar sem divergência) e faixa da dívida de desempenho |

## Rodadas
| Rodada | testes | arquiteto | especialista-obra | seguranca | auditoria |
|---|---|---|---|---|---|
| 01 (68a9401) | APROVADO | REPROVADO | REPROVADO | REPROVADO | — |
| 02 (875c518) | APROVADO | APROVADO (4 baixos) | APROVADO COM RESSALVAS (R-1..R-3) | APROVADO (1 baixo) | — |
| 03 (20e01fa) | — | — | REPROVADO (R-A: marco tardio entre tarefas) | — | REPROVADO (cobertura vermelha por timeout; sem revalidação; registro) |
| 04 (e8b4dae) | APROVADO (cobertura 2× verde) | — | APROVADO COM RESSALVAS (R-E) | — | — |
| 05 (255dca3) | APROVADO (cobertura 2× verde; export do seed 0 linhas) | — | APROVADO COM RESSALVAS (R-F, registrada como dívida) | — | REPROVADO (4 pequenos) → 34bd885 |
| final (34bd885) | — | — | — | — | **APROVADO** |

## Ressalvas e destino
| Origem | Ressalva | Destino |
|---|---|---|
| arquiteto r01 A1 / seguranca r01 Alto / especialista P-8 | Teto de 50 anos derruba a tela; import deixa o app em branco e a obra reabre quebrada | `calculo` com fallback + `erroCronograma`; import recusado antes de gravar; ações simulam antes (`horizonte.ts`); data de status < 45 anos (875c518) |
| arquiteto r01 A2 / seguranca r01 | Calendário inválido no estado salvo | descartado com aviso; padrão refeito (875c518) |
| especialista r01 P-1..P-4 | Fórmulas: moverRestante=false com vínculo; FF/SF em iniciada; FNLT/MFO em iniciada; ALAP com sucessora | corrigidas com teste (875c518); antes → depois abaixo |
| especialista r01 P-5 / J | Data do marco no dia anterior | `marcoDe` (875c518); tardia em 20e01fa e e8b4dae |
| arquiteto r01 M1 / seguranca r01 | Calendário sem tempo útil na semana trava | recusado + limite `TETO_DIAS` no `WorkCalendar` (875c518); emenda 02 |
| arquiteto r01 M2 / especialista P-6 | Manual exportada com datas calculadas | datas do arquivo se não alterada (875c518), com hora (20e01fa), aviso testado (e8b4dae) |
| arquiteto r01 M3 / especialista | `moverRestante=false` sem fonte | política documentada em `calculo-precisao.md` + aviso na tela (875c518) |
| especialista r01 P-7 | Duração corrida começa no próximo momento útil | dívida M-6 |
| especialista r01 P-9 / P-10 | Gerador de desempenho incompleto; asserção circular | gerador completo; asserção fixa (875c518) |
| arquiteto r01 B1..B4 | Constantes 1440; `toDuration`/`fromDuration`; resumo com 480 fixo; docs de processo; validação duplicada | corrigidos (875c518) |
| seguranca r01 baixos | `Duration`/`MinutesPerDay` sem faixa; `Math.min(...spread)` | corrigidos (875c518) |
| testes r01 | Comentário errado (1.620 = 3 × 540); N-4 circular; constante duplicada em `wbs.ts` | corrigidos (875c518); N-4 contra o JSON v1 com `baselineDuracaoMin` (20e01fa) |
| arquiteto r02 #1 / especialista r02 R-2 | Prévias com fallback mostram "sem impacto" | `simular` devolve erro; prévias `{ erro }`; ações `addSinapiTask`, `generateFromBudget`, `approveReport`, `applyScenario` com `erroSeAplicar` (20e01fa) |
| arquiteto r02 #2 | `calendar`/`baseCalendar` fora da proteção | dentro do `calculo` (20e01fa) |
| arquiteto r02 #3 | Desempenho por edição | medido; ~0,8 s em máquina livre a ~1,5 s carregada (medianas de 767 a 1.435 ms); dívida aceita (D-ed) |
| arquiteto r02 #4 | Lista de cálculos duplicada | `calcularObra` único (20e01fa) |
| especialista r02 R-1 | Marco tardio 1 dia antes | 20e01fa (só o caso SNET); e8b4dae (os dois casos) |
| especialista r02 R-3 | Manual perde a hora | `inicioHora`/`terminoHora` (20e01fa) |
| seguranca r02 | Mensagem de qualquer erro na tela; datas do estado salvo sem validação | mensagem genérica salvo erros conhecidos; datas inválidas → ilegível (20e01fa; emenda 03) |
| especialista r03 R-A | Marco tardio entre tarefas um dia depois | `lf === s` (e8b4dae), teste com 6 casos |
| especialista r03 R-B | Teste local de edição instável | teto local 2.500 ms; setup em `beforeAll` (e8b4dae) |
| especialista r03 R-C | Obra com datas inválidas sem recuperação | dívida (emenda 03) |
| especialista r03 R-D | 00:00 de calendário 24 h | "24:00" do dia; export converte para 00:00 do dia seguinte (e8b4dae) |
| auditoria r01 #1 | `test:coverage` vermelho por timeout | `beforeAll` + timeout explícito; 3 execuções verdes (e8b4dae) |
| auditoria r01 #2 | Rodada 03 sem revalidação | revalidação de `testes` e `especialista-obra` sobre e8b4dae |
| auditoria r01 #3..#5, #8..#11 | Registro: ressalvas, matriz, antes → depois, afirmação falsa, D-ed, V-*, escopo | este registro |
| auditoria r01 #6 | Calendário só com exceção útil | emenda 02 |
| especialista r04 R-E | Tarefa comum às 24:00 sai um dia antes; `Early*`/`Late*` do marco 24:00 um dia antes | `horaDeTermino` e `horaDaData` + `dt` em todo campo; import normaliza para reimportar sem divergência (255dca3) |
| testes r04 | Faixa documentada da edição abaixo da medida | "~0,8 s livre a ~1,5 s carregada" nos docs (255dca3) |
| especialista r05 R-F | Marco SEM predecessora com SNET/MSO às 00:00 em calendário de 24 h fora do início do projeto: o motor mostra o dia anterior às 24:00 e a heurística do import mantém o dia → divergência falsa de 1 dia | dívida (0 casos nos 134 arquivos do corpus); correção mínima: a heurística usa o mesmo critério do `marcoDe`; correção de fundo (opinião): "dia anterior às 24:00" só para momento vindo de término; conferir no M-6 |
| auditoria r01 #7 | Aviso de manual alterada sem teste | teste com 0, 1 e 3 alteradas (e8b4dae) |

### Matriz de verificação (HEAD 255dca3)

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| G-LINT / G-TIPOS | eslint e vue-tsc | `npm run lint`, `npm run typecheck` | sim | PASS | limpos (auditoria e `testes`, 255dca3) |
| R-6 | Cobertura ≥ 80% com a suíte verde | `npm run test:coverage` (várias execuções) | sim | PASS | `testes` sobre 255dca3: 2 execuções idênticas, 444 testes, 8 pulados, 97,79 / 91,83 / 98,2 / 97,79, sem timeout; dev: 3 execuções verdes em e8b4dae |
| R-2 / P-5 | E2E: KPIs do Aurora, migração, troca de obra, painel | `CI=1 npm run e2e` | sim | PASS | `17 passed (1.4m)` (`testes`, 255dca3) |
| AC-11 / M-4 | Corpus: 95/95 ida e volta, 83/104 e 100/104, sem regressão com a heurística de reimport | `CRONOAI_REF_DIR=… vitest run src/lib/msProjectXmlParser.corpus.test.ts` | sim | PASS | 419/419 (`testes` e `especialista-obra`, 255dca3); nenhuma tarefa do corpus cai às 00:00 |
| AC-14 | Motor < 500 ms com 3.000 folhas (RNF-05.1) | `CRONOAI_PERF=1 … cpm.desempenho.test.ts` | sim | PASS | mediana 204 ms (`testes`, 255dca3); 181 ms (e8b4dae); 138 ms (auditoria, 20e01fa) |
| D-ed | Edição de célula < 500 ms (RNF-05.1: "recalculados em menos de 500 ms") | mesmo arquivo, teste de `updateTask` | sim | FAIL (aceito) | medianas de 767 ms a 1.435 ms conforme a carga (802 ms e8b4dae; 1.014 ms `testes` 255dca3; 767 ms auditoria). Dívida aceita pelo orquestrador, sujeita à revisão do usuário; registrada no `CLAUDE.md`, em `divida-conhecida.md` e em `testes.md`; o cálculo vai para o servidor nos ciclos 00016/00017 de `docs/specs/PLANO-FASE-2.md` (branch `feat/00011-backend-esqueleto`) |
| AC-1 / CR-1 | Caracterização sem mudança no E1 | `cpm.caracterizacao.test.ts` + motor de 616dad7 | sim | PASS | 40/40 linhas iguais ao motor antigo (`testes` r01); arquivo sem alteração nas rodadas 02–05 |
| R-1 (plano) / M-3 | Export do seed: E1 idêntico; E3 só o declarado | diff do export normalizado | sim | PASS | base × E1: 0 linhas; base × HEAD só horas/folgas exatas, 5 `Duration` de resumo, `SplitsInProgressTasks`=1; 875c518 × 20e01fa × e8b4dae × 255dca3: 0 linhas (auditoria e `testes`) |
| N-1..N-3 | KPIs do Aurora | `useProjectStore.test.ts` | sim | PASS | 23/06/27, +16 d.u., SPI 0,8883, CPI 0,9349; 16/06/27 (−5); 18/06/27. O teste mudou só o formato do retorno na rodada 03 (`{ ok: true, delta: -5 }`); o número é o mesmo |
| D-1..D-6 / AC-12 | Painel de divergências | `divergencias.test.ts` + E2E | sim | PASS | D-2 +1, D-3 +1, D-4 −4, D-5 +1, D-6 −4 com as causas; arquivo sem alteração nas rodadas 02–05 |
| AC-2..AC-9 (CR-2..CR-12) | Casos do plano (Emenda 01) | `cpm.test.ts`, `calendarioTrabalho.test.ts`, `evm.test.ts`, parser | sim | PASS | conferidos célula a célula com o simulador independente do `especialista-obra` (r01–r03) |
| PR-C / PR-D / PR-E / PR-F | Fórmulas corrigidas na rodada 02 | testes "C", "D", "E", "F" | sim | PASS | antes → depois na seção "Números que mudaram" (`especialista-obra`, r03) |
| PR-J / PR-RA | Data do marco (cedo, agendada e tardia) | testes "J" e "R-1/R-A" | sim | PASS | 6 casos de marco tardio (e8b4dae) |
| AC-10 / H | MSPDI ida e volta com `strictOrder`; manual com datas e hora do arquivo; aviso de alterada | parser + `useProjectStore.horizonte.test.ts` "rodada 04" | sim | PASS | 09:30–16:45 ida e volta; aviso com 0, 1 e 3 alteradas (e8b4dae) |
| PR-24H | Hora 24:00 (calendário de 24 h) em todo campo de data-hora do export; reimport sem divergência | `cpm.test.ts` + parser "R-D" | sim | PASS | tarefa de 24 h: `Finish`/`EarlyFinish`/`LateFinish` = 2026-08-04T00:00:00; marco: os 6 campos = 2026-08-04T00:00:00; reimportar dá `calcularDivergencias` = `[]` (255dca3; conferido pela sonda `export24.ts` do `especialista-obra`) |
| AC-13 | Edição na tela com validação e indicadores | `useProjectStore.test.ts` "AC-13…" + E2E 3 e 4 | sim | PASS | auditoria (20e01fa); E2E 17/17 (e8b4dae) |
| AC-15 | Docs e ADR 00003 | revisão | sim | PASS | ADR 00003 e índice; `CLAUDE.md` (mapa com `horizonte.ts`, `previas.ts`; dívidas), `calculo-precisao.md`, `msproject-mspdi.md`, `divida-conhecida.md`, `testes.md` (e8b4dae) |
| N-8 | Propriedade: folga ≥ 0 em 200 redes | `cpm.test.ts:537` | sim | PASS | verde (auditoria) |
| P-MIG | Migração 2 → 3 com `undo`; esquema 4 recusado; calendário inválido descartado; datas inválidas → ilegível | `migracaoEstado.test.ts`, `useProjectStore.obras.test.ts` | sim | PASS | N-4 contra o JSON v1 (`duracaoMin`, lag, `baselineDuracaoMin` × 480) |
| S-HOR | Teto de 50 anos sem derrubar a tela | `useProjectStore.horizonte.test.ts` + sondas | sim | PASS | sonda `StatusDate` 2070 + `PT24000H` recusada; obra salva quebrada abre com aviso, exporta e troca de obra (`seguranca` r02) |
| S-1, S-3, S-4 | Limites de entrada externa; avisos sem texto do arquivo; endurecimentos do 00003 | testes + sondas | sim | PASS | `seguranca` r02 |
| S-5 | Sem dependência nova | `package.json` sem diff | sim | PASS | — |
| S-6 | Fixtures fictícias | revisão | sim | PASS | `mspdi-calendarios-restricoes.xml`, `mspdi-divergencias.xml`: "Construtora Fictícia", "Planejador Fictício" (`seguranca` r01) |
| R-3 | Conversão de unidade num lugar só | `git grep 1440/480` | sim | PASS | só `calendarioTrabalho.ts` e o parser |
| R-4 | `src/lib` puro | `validar-regras` | sim | PASS | 0 bloqueios; 1 alerta R04 justificado (`migracaoEstado.ts:190`) |
| V-3 | Painel de divergências com estado vazio | `npm run dev` | não | PASS | orquestrador (porta 5181, c04 em 20e01fa) |
| V-4 | Opções de cronograma no formulário da obra | `npm run dev` | não | PASS | orquestrador: "mover o restante" e "lógica retida" em `#/obras`; EAP com as 8 restrições e o seletor de calendário; console sem erros (c04, 20e01fa) |
| V-1, V-2 | Painel com a fixture importada; folga em "d" com decimal | `npm run dev` | não | NOT_RUN | importar arquivo exige seletor de arquivo; V-1 coberto pelo E2E |
| M-5 | `.xml` abre no MS Project real | manual | não | NOT_RUN | sem acesso |
| M-6 | Regras no MS Project real (P1, HonorConstraints, ALAP, LinkLag %, início de tarefa corrida) | manual | não | NOT_RUN | Engenharia de planejamento, antes do piloto |
| PERF-CI | Teste de desempenho sem teto frágil no CI | `cpm.desempenho.test.ts` | sim | PASS | o teste que roda no CI só afirma a edição aceita (o efeito no cronograma é provado pelo E2E e pelos testes de número); o tempo fica no teste local `CRONOAI_PERF` (sem cobertura). Antes: teto fixo de 5.000 ms com ~20% de folga sob cobertura (reauditoria) |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | PASS | **APROVADO** na conferência final (34bd885), sem achado novo; EVIDENCIAS-CONFERIDAS 25 de 27 (V-3 e V-4 visuais, Obrig. não, conferidas pelo orquestrador). Histórico: reprovou a rodada 03 (cobertura instável, sem revalidação, registro) e a reauditoria da 05 (margem do teste no CI, docs, registro) |

## Números que mudaram de propósito (antes → depois)
Conta independente do `especialista-obra` rodando os mesmos casos em `68a9401` (antes da rodada 02) e no código atual. Base 03/08/2026; previsão com data de status 05/08.

| Caso | Antes | Depois |
|---|---|---|
| CR-9: restante exato no Aurora | 12 inícios da cadeia crítica um dia depois | 12 inícios recuam 1 dia; entrega 2027-06-23 09:36 (mesmo dia) |
| Suprimentos (efeito do CR-9) | concreto ok, DLP 31/10; bloco +25; porcelanato +24; aço DLP 19/10 | concreto **atenção** ("Emitir pedido em 7 dias"), DLP 30/10; bloco +24; porcelanato +21; aço DLP 18/10 |
| CR-11b: início depois da data de status | 2027-06-22 / 15 d.u. | 2027-06-23 / 16 d.u. |
| CR-12: LB0 só com término | sobrescrita pelo CPM | término do arquivo mantido |
| C: B 10 d a 50%, iniciada 03/08, A 1 d FS, sem mover o restante | B termina 10/08 17:00 | 14/08 17:00 |
| C: idem com A de 3 d | 12/08 17:00 | 14/08 17:00 |
| D: A 10 d (06–19/08), B 4 d a 50% com FF+0 | B termina 17/08; FT 2 d; não crítica (FF violado) | 19/08 17:00; FT 0; crítica |
| E: iniciada 10 d a 50%, FNLT 07/08 | FT 0; sem conflito | FT −3 d; conflito; crítica |
| E: idem com MFO 07/08 | FT 0; sem conflito | FT −3 d; conflito |
| F: X 10 d; Y 3 d ALAP; Z 2 d FS de Y | Y 10–12/08 FT 5 d; **Z 06–07/08** (antes de Y terminar) | Y 10–12/08 FT 0; Z 13–14/08 FT 0; fim 14/08 |
| F: cadeia Y1 ALAP → Y2 ALAP → W | W 10/08, FT 4 d | W 14/08, FT 0 |
| J: marco com SNET ou MSO 12/08 | 11/08 17:00 | 12/08 08:00 |
| J: marco SS+0 de tarefa que começa seg 10/08 | 07/08 17:00 | 10/08 08:00 |
| Marco tardio, SNET 12/08 sozinho | LS 12/08, LF 11/08 | 12/08 e 12/08 |
| Marco tardio, FS entre A (sex 07/08) e B (seg 10/08), folga 0 | LS 10/08, LF 07/08 | 07/08 e 07/08 (e8b4dae) |
| Marco às 00:00 num calendário de 24 h | export "2026-08-03T00:00:00" (um dia antes) | "24:00" do dia na tela; export "2026-08-04T00:00:00" nos 6 campos |
| Tarefa de 1 d num calendário de 24 h (03/08 00:00 → 04/08 00:00) | término "03/08 00:00"; export `Finish`/`EarlyFinish`/`LateFinish` 2026-08-03T00:00:00 (um dia antes) | término "03/08 24:00"; export 2026-08-04T00:00:00 |
| Corpus: avisos de duração, calendário próprio, lag ≠ dias úteis, "N h/dia" | 5, 4, 20, 1, 12, 2 | 0 (agora preservados); novos: 1.136 tarefas manuais em 38 arquivos, 3 durações com segundos |
| Export do seed | — | horas e folgas exatas, 5 `Duration` de resumo, `SplitsInProgressTasks`=1 |

## Escopo além do plano (registrado)
Tudo veio de pedidos dos validadores ou da auditoria:
- `src/lib/horizonte.ts`: cálculo único e verificação antes de gravar.
- `src/types/previas.ts` e os retornos `{ ok, erro }` de `addSinapiTask`, `generateFromBudget`, `approveReport`, `applyScenario`.
- Mensagens de erro em `AvisoArmazenamento.vue`, `AiMappingPanel.vue`, `SinapiModule.vue`, `BudgetSheet.vue`, `CriticalPathModule.vue`, `ObrasModule.vue`, `useMsProject.ts`.
- Docs de processo `.claude/agents/arquiteto.md`, `.claude/checklists/qualidade.md` e `prompts/06-arquiteto-revisao-f3.md`, que citavam `toDuration`/`fromDuration` (removidas) e "dias úteis inteiros".

## Dívida aceita
- **D-ed (edição de célula com 3.000 tarefas):** ~0,8 s em máquina livre a ~1,5 s carregada (medianas de 767 a 1.435 ms). São três cálculos por edição: previsão e linha de base na verificação, mais a previsão da tela. Aceita no protótipo; o cálculo vai para o servidor (PLANO-FASE-2, ciclos 00016/00017).
- **R-C:** obra com datas inválidas sem caminho de recuperação (emenda 03).
- **R-F:** marco sem predecessora com SNET/MSO às 00:00 em calendário de 24 h fora do início do projeto gera divergência falsa de 1 dia (0 casos no corpus); conferir no M-6.
- **M-5/M-6:** P1 (regra da sucessora, fonte de terceiros), `HonorConstraints` = 0, folga de ALAP, `LinkLag` em % e início da tarefa corrida no próximo momento útil.
- **Herdado pelo 00005:** `feriadosNacionaisAplicados` e os feriados injetados no import; o gerador `feriadosPorAno`; o `undo` da hora extra com exceções.

## Validação de outras áreas
- **Engenharia de planejamento:** M-5 e M-6 antes do piloto.
- **Orçamento/Custos e Suprimentos:** concreto ok → atenção pelo restante exato.
