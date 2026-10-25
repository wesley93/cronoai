---
issue: —
spec: SPEC-00 (incremento 0.2)
ciclo: .claude/ciclos/00001-e2e-cobertura.md
branch: feat/00001-e2e-cobertura
base: master
faixa: 3
status: rascunho
data: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00001 — E2E com Playwright e cobertura mínima em `src/lib`

## Resumo
- **O que é:** testes de ponta a ponta (Playwright, Chromium) dos fluxos principais do CronoAI, rodando localmente e num job novo do CI, e cobertura de testes (`@vitest/coverage-v8`) com mínimo de 80% em `src/lib`, bloqueando o CI. Nenhum código de produção em `src/` muda.
- **Risco que justifica a faixa 3:** T5, com duas dependências novas (`@playwright/test`, `@vitest/coverage-v8`) e download de navegador no CI. Também T7 (`ci.yml`, `.dockerignore`).
- **Por que primeiro:** é a rede de proteção para o multiobra (00002, que reestrutura a store), para a robustez do import com o corpus MSPDI (00003) e para o motor em minutos (00004). Ver `docs/specs/PLANO-FASE-1.md`.
- **O que você precisa fazer:** responder à **P1** (métrica do limiar; seção 12), aprovar o plano e validar com **Jurídico** (licenças) e **Segurança da Informação** (dependências e download do navegador no CI) antes do uso em produção. O merge não depende disso: são só dependências de desenvolvimento.
- **Estado:** rascunho, **bloqueado na P1**. As tarefas que dependem da resposta estão marcadas.

## 01. Pedido e objetivo
SPEC-00, §9 item 2 (incremento 0.2): "Playwright E2E, cobertura de testes (`@vitest/coverage-v8`) com mínimo de 80% em `src/lib`". Critério da §7: "Playwright E2E cobrindo o fluxo 'aprovar apontamento → exportar XML' e 'aplicar cenário'". RNF afetados: RNF-00.1 (só actions oficiais), RNF-00.2 (`permissions` mínimas), RNF-00.3 (CI em menos de 5 min), RNF-00.5 (Node do `.nvmrc`).

**Objetivo:** uma regressão nos fluxos de tela (apontamento, cenário, XML, navegação, persistência) ou uma queda de cobertura de `src/lib` quebra o CI antes do merge.

**Requisito do usuário (Brasil todo, multiobra):** não muda este ciclo. Os fluxos rodam sobre a obra de exemplo, sem supor UF. O E2E "recarregar mantém o estado salvo" (AC-6) fixa o comportamento que a migração para várias obras (00002) precisa preservar. O E2E de troca de obra entra no 00002, junto com o recurso.

### Contexto para execução (ler antes)
| Arquivo | Por quê |
|---|---|
| `vite.config.ts` | O bloco `test` atual (`environment: 'jsdom'`) recebe `include` e `coverage`; não criar `vitest.config.ts` separado |
| `package.json` | Scripts `test` e `ci` (o `ci` é o mesmo comando do Release) |
| `.github/workflows/ci.yml` | Job `verify` ("Lint, tipos, testes e build" é check obrigatório da `master`: **não renomear**); imitar os passos de checkout e setup-node |
| `.claude/rules/docker-ci.md` | Regras de workflow: só actions oficiais, `persist-credentials: false`, sem `paths`, `permissions` mínimas |
| `src/stores/useProjectStore.ts:110-121` | `loadState`: um contexto de navegador novo (localStorage vazio) abre a obra de exemplo, que é o isolamento entre testes |
| `src/lib/useMsProject.ts:12-42` | O download só acontece se `validateMspdi(…, { strictOrder: true })` passar; textos dos toasts de export e import |
| `src/modules/field/AiMappingPanel.vue:56-69, 213` | Botão "Aprovar e Atualizar EAP" e texto do toast com "Entrega antecipada em N dia(s) útil(eis)" |
| `src/modules/CriticalPathModule.vue:45-50`, `src/modules/critical/ScenarioCard.vue:21, 81-83` | Cartão do cenário (título `h3`) e botão "Aplicar no cronograma" |
| `src/components/layout/AppTopbar.vue:36-63` | "Entrega das chaves" só aparece em `xl` (≥ 1280 px); botões "Importar .xml" e "Exportar para MS Project" no `header` |
| `src/components/layout/AppSidebar.vue:167-180`, `src/stores/ui.ts:4-11` | Os 6 módulos (rótulos e hash `#/{id}`) |
| `src/components/common/ModuleHeader.vue` | O `h1` de cada módulo, usado para confirmar que a tela carregou |
| `eslint.config.js`, `tsconfig.json`, `.dockerignore`, `.gitignore` | Recebem as pastas e arquivos novos |

## 02. Triagem
- **T1 NÃO:** nenhum arquivo de `cpm.ts`/`calendar.ts` muda.
- **T2 NÃO:** `evm.ts`, `scenarios.ts`, `supplies.ts`, `sinapi*.ts` e `progressPatch` não mudam. Os testes novos de ramos (opção B/C da P1) não alteram cálculo.
- **T3 NÃO:** `msProjectXmlParser.ts` não muda. O E2E só exercita o export e o import existentes.
- **T4 NÃO:** o formato do estado salvo não muda.
- **T5 SIM:** dependências novas `@playwright/test` (Apache-2.0) e `@vitest/coverage-v8` (MIT, com transitivas istanbul etc.); o CI passa a baixar o Chromium e os pacotes de sistema do Playwright (`--with-deps` usa `apt` com `sudo` no runner).
- **T6 NÃO:** `fieldAi.ts` e `approveReport` não mudam. O E2E aprova pela tela, que é o fluxo humano.
- **T7 SIM:** `.github/workflows/ci.yml`, `.dockerignore` e `.github/pull_request_template.md`.
- **T8 NÃO:** sem backend.

**Faixa 3 confirmada (T5).** `seguranca` obrigatório; `especialista-obra` não é exigido (sem T1/T2/T3).

## 03. Decisões de design
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Playwright (`@playwright/test`), só **Chromium** | Chromium + Firefox + WebKit | O ferramental é o da spec. Três motores triplicam o tempo (RNF-00.3); o público usa Edge/Chrome no Windows, junto com o MS Project. Os outros motores ficam fora |
| Alvo = **build de produção** servido por `vite preview` (porta 4173, `strictPort`) pelo `webServer` do Playwright; comando `npx vite build && npx vite preview --port 4173 --strictPort` | Servidor de dev (5180) ou o container Nginx | O dev tem HMR e avisos que o usuário não vê. O container exige Docker no job e dobra o tempo; CSP e headers já são cobertos pelo smoke test do workflow Docker |
| Pasta `e2e/` na raiz, arquivos `*.spec.ts`, `playwright.config.ts` na raiz | `src/e2e/` | Ficaria no alcance do lint de `src`, da cobertura e do `include` padrão do Vitest |
| Vitest restrito a `test.include: ['src/**/*.test.ts']` | Manter o `include` padrão | **Obrigatório:** o padrão do Vitest pega `**/*.spec.ts` e tentaria rodar os specs do Playwright no `npm test` |
| Seletores por papel e texto acessível (`getByRole`, `getByText`), com escopo (`getByRole('banner')` no topo; o cartão pelo `h3`) | `data-testid` nos componentes | Não muda nenhum arquivo de `src/`; os papéis já existem (`h1` no `ModuleHeader`, botões com texto). Se algum fluxo não tiver seletor estável sem mudar `src/`, o dev **para e devolve** (fora do escopo) |
| Isolamento: cada teste num contexto novo (localStorage vazio → obra de exemplo) | Restaurar pela UI | "Restaurar obra de exemplo" usa `window.confirm` (`AppSidebar.vue:142-147`) e acopla os testes entre si |
| Viewport 1440×900 e `locale: 'pt-BR'` | Viewport padrão | Os KPIs do topo só aparecem em `xl`. Fuso não importa: `format.ts` formata datas em UTC |
| Export: `page.waitForEvent('download')`, `saveAs` em `testInfo.outputPath()`; toast "XML do MS Project gerado e validado" + checagem textual do arquivo | Novo parser XML em Node para revalidar | O toast só aparece se `validateMspdi` com `strictOrder` passou (`useMsProject.ts:13-19`). A validação estrutural já tem teste unitário (`msProjectXmlParser.test.ts`). Uma dependência a mais só para isso não se paga |
| Import: clicar "Importar .xml" no `banner` e usar `page.waitForEvent('filechooser')` → `setFiles` | `setInputFiles` direto no `input` oculto | Há dois `input type=file` (topo e EAP); o filechooser segue o caminho do usuário sem depender de seletor de `input` |
| Console: falha em `console` do tipo `error` e em `pageerror`; avisos não falham | Falhar em qualquer mensagem | O build de produção do Vue não emite avisos de dev; avisos de biblioteca (Chart.js) gerariam falso positivo |
| Cobertura v8 no bloco `test.coverage` do `vite.config.ts`: `include: ['src/lib/**/*.ts']`; `exclude: ['src/lib/**/*.test.ts', 'src/lib/download.ts', 'src/lib/useMsProject.ts']`; `reporter: ['text', 'text-summary', 'html']`; `reportsDirectory: 'coverage'`; `thresholds` conforme a P1 | `vitest.config.ts` separado; incluir os dois arquivos de DOM/store | Dois arquivos de configuração divergem. `download.ts` e `useMsProject.ts` são as exceções de DOM/store do `CLAUDE.md` e ficam cobertos pelo E2E (export/import) |
| `@vitest/coverage-v8` na **mesma versão** do `vitest` (3.2.x; o pacote exige a versão exata como peer) | Versão "mais nova" | Versões diferentes não carregam. Na migração para o `vitest` 5 (dívida conhecida) os dois sobem juntos; o grupo de dev do Dependabot já os agrupa |
| Scripts: `test:coverage` = `vitest run --coverage`; `e2e` = `playwright test`; `e2e:instalar` = `playwright install chromium`; `ci` = lint + typecheck + `test:coverage` + build | E2E dentro do `npm run ci` | O `ci` é o mesmo do Release (`release.yml`), que não precisa de navegador. Com a cobertura dentro do `ci`, o limiar bloqueia local, CI e Release igualmente |
| CI: **job novo** `e2e` (nome "Testes E2E (Playwright)") no `ci.yml`, paralelo ao `verify` (sem `needs`), herdando `permissions: contents: read` do topo (sem bloco `permissions` no job) | Passo dentro do `verify` | Em paralelo o CI fica abaixo de 5 min (RNF-00.3) e a falha de E2E aparece separada. Não entra nos checks obrigatórios agora: depois da 1ª execução verde, **você** decide incluí-lo na proteção da `master` (`docs/devops.md` §3) |
| Passo "Testes" do `verify` passa a rodar `npm run test:coverage` | Job separado de cobertura | Evita rodar a suíte duas vezes |
| Navegador no CI: `actions/cache` (oficial) de `~/.cache/ms-playwright`, chave = SO + versão do `@playwright/test` no `package-lock.json`. Com o cache: `npx playwright install-deps chromium`; sem ele: `npx playwright install --with-deps chromium` | Sem cache | Mantido porque foi pedido. **Atenção:** a documentação oficial **não recomenda** o cache de navegadores, porque restaurar leva quase o mesmo tempo que baixar ([playwright.dev/docs/ci#caching-browsers](https://playwright.dev/docs/ci#caching-browsers)). O dev mede no 1º PR (com e sem o cache) e registra no ciclo; se não houver ganho, o cache sai **neste mesmo PR** |
| Artefatos: `actions/upload-artifact` de `playwright-report/` e `test-results/` (trace, screenshot) com `if: failure()`, retenção de 7 dias | Sempre publicar | Só a falha precisa de diagnóstico. Os traces mostram só a obra fictícia (sem PII) |
| Playwright: `forbidOnly: !!process.env.CI`, `retries: CI ? 1 : 0`, `workers: CI ? 1 : undefined`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'off'`, reporter `list` + `html` (`open: 'never'`) + `github` no CI | Sem repetição | Opinião: uma repetição no CI absorve instabilidade do runner. Um teste "flaky" (passou só na repetição) aparece no relatório e é registrado no ciclo, nunca ignorado |
| `tsconfig.json`: incluir `e2e/**/*.ts` e `playwright.config.ts` | `tsconfig` próprio do E2E | Um comando só (`npm run typecheck`) cobre os specs. Os imports de `@playwright/test` sombreiam os globais `test`/`expect` do `vitest/globals` |
| `eslint.config.js`: `e2e/**/*.ts` e `playwright.config.ts` no bloco de globais Node; ignorar `playwright-report/**`, `test-results/**` | Desligar o lint no E2E | O E2E segue as mesmas regras (sem `any`) |
| `.dockerignore`: `e2e`, `playwright.config.ts`, `playwright-report`, `test-results`, `blob-report` (o `coverage` já está lá) | Mandar para o contexto do build | O build da imagem (`npm run build` com `vue-tsc`) não precisa dos specs. A imagem final não muda (só `dist/`) |
| `.gitignore`: `coverage/`, `playwright-report/`, `test-results/`, `blob-report/` | — | Artefatos locais não são versionados |

ADR: não se aplica (ferramenta de teste, sem decisão estrutural de produto).

## 04. Caso de referência (T1/T2)
Não há cálculo alterado (T1/T2 = NÃO). As asserções do E2E fixam os **números atuais** do motor sobre a obra de exemplo. Medição de 25/10/2026, pela store (`buildSeedState`, data de status 2026-10-23):

| Caso | Entrada | Esperado (tela) | Fonte | Teste que fixa |
|---|---|---|---|---|
| C-1 | Obra de exemplo, sem ação | Topo "Entrega das chaves" **23/06/27**, chip **+16 d.u.**; SPI **0,89**; CPI **0,93** | Motor atual (`computeSchedule`/`computeEvm`): `projectFinish` 2027-06-23, `delayDays` 16, SPI 0,8883, CPI 0,9349 | `e2e/fluxos.spec.ts` › C-1 e `useProjectStore.test.ts` (N-1) |
| C-2 | Aprovar o relato do Mestre Tião (`r-tiao`, pré-selecionado), sugestão 75% para UID 104 (03.01.02, hoje 40%) | Toast "Avanço 40% → 75%. Entrega antecipada em **5** dia(s) útil(eis)."; topo **16/06/27**, **+11 d.u.** | `approveReport` → `delta` −5; `projectFinish` 2027-06-16 | `e2e/fluxos.spec.ts` › aprovar apontamento; `useProjectStore.test.ts` (N-2) |
| C-3 | A partir do seed, aplicar "Crashing (Compressão)" (alvo UID 105) | Toast "Crashing (Compressão) aplicado" com "Entrega: **23/06/27 → 18/06/27**" e custo **R$ 12.617**; topo **18/06/27**, **+13 d.u.** | `simulateCrashing`: 3 d.u. recuperados, `extraCost` 12.616,80; `projectFinish` 2027-06-18; `delayDays` 13 | `e2e/fluxos.spec.ts` › crashing; `useProjectStore.test.ts` (N-3) |
| C-4 | A partir do seed, "Exportar para MS Project" no topo | Download `Edificio_Residencial_Aurora_12_Pavimentos_2026-10-23.xml`; toast "XML do MS Project gerado e validado" com "**29 tarefas, 24 vínculos**"; o arquivo começa com `<?xml`, contém `xmlns="http://schemas.microsoft.com/project"` e **30** elementos `<Task>` (29 + tarefa-resumo do projeto) | `exportXml`: `taskCount` 30, `linkCount` 24, `errors` [] | `e2e/fluxos.spec.ts` › exportar |
| C-5 | Importar o arquivo do C-4 pelo "Importar .xml" do topo | Toast "Cronograma importado" com "**29 tarefas** carregadas"; **nenhum** toast "Atenção na importação"; topo continua **23/06/27** | `importXml`: 29 tarefas, `warnings` [], `projectFinish` 2027-06-23 | `e2e/fluxos.spec.ts` › importar |
| C-6 | Clicar nos 6 módulos da barra lateral | Cada um mostra o `h1` (tabela abaixo) e o hash `#/{id}`; **zero** `console.error` e `pageerror` | `ui.ts:4-11`; `ModuleHeader` de cada módulo | `e2e/navegacao.spec.ts` |
| C-7 | Depois do C-2, recarregar a página | UID 104 continua em 75% e o topo em **16/06/27** | Gravação com atraso de 300 ms (`useProjectStore.ts:141-155`); o teste espera a gravação antes de recarregar, sem `sleep` fixo | `e2e/fluxos.spec.ts` › persistência |

`h1` dos módulos: Apontamento IA → "Apontamento de Canteiro via IA & Sincronização MS Project"; Caminho Crítico → "Motor de Caminho Crítico & Simulador “E se?”"; Suprimentos JIT → "Orquestrador de Suprimentos Just-in-Time"; Gerador SINAPI → "Gerador de Cronograma via Orçamento SINAPI"; Valor Agregado → "Dashboard de Valor Agregado (EVM) e Curva S"; EAP / MS Project → "EAP / Cronograma do MS Project".

Estes números **vão mudar de propósito** a partir da 00004 (motor em minutos). Quem mudar atualiza E2E e teste de store juntos, com antes e depois no PR (Inviolável 1).

## 05. MS Project e arquivos (T3)
Não se aplica: `msProjectXmlParser.ts` não muda. O E2E usa o arquivo gerado pelo próprio app a partir da obra fictícia (C-4), que não é versionado: nasce em `test-results/` a cada execução.

## 06. Estado salvo (T4)
Não se aplica: o formato não muda. O C-7 lê o estado salvo atual e serve de referência para a migração do 00002. A chave `cronoai-state-v1` só aparece no E2E se for preciso esperar a gravação; nesse caso, o 00002 atualiza a referência.

## 07. Dados (T8 com banco)
Não se aplica: sem backend.

## 08. Segurança
| Superfície | Ameaça | Mitigação |
|---|---|---|
| `@playwright/test` e `@vitest/coverage-v8` (e as transitivas) | Pacote comprometido; licença incompatível | Só `devDependencies` (não vão para o bundle; o `npm audit --omit=dev` continua zerado); `auditar-dependencias.mjs` lista as licenças; revisão de **Segurança** e **Jurídico** antes do uso em produção |
| Download do Chromium e `apt` com `sudo` no runner | Binário adulterado | O Playwright baixa do CDN oficial dele; o job tem token só de leitura (`contents: read`) e `persist-credentials: false`, sem segredo. Registrar com a Segurança como parte da revisão da dependência |
| Workflow | Escalada de permissão, action de terceiro | Sem bloco `permissions` novo (herda `contents: read`); só `actions/*`; sem `pull_request_target`; sem `${{ github.event.* }}` em `run:`; sem `paths` |
| Artefatos (trace/screenshot) | Vazamento de dado | Só a obra fictícia; retenção de 7 dias; publicados só na falha |
| Docker | Specs/relatórios no contexto do build | `.dockerignore` atualizado; a imagem final não muda (verificar no smoke test) |
| `npm ci` no estágio de build da imagem | Instalar `@playwright/test` baixar navegador | O pacote não baixa navegador na instalação; **conferir** no log do workflow Docker que o tempo e o tamanho do estágio não saltaram |

## 09. Entregáveis
| # | Entregável | Fronteira | Critérios de aceite | Commit (Conventional Commits) |
|---|---|---|---|---|
| 1 | E2E + cobertura + CI | Configuração, testes e workflow, sem código de produção | AC-1 a AC-12 | `test(e2e): Playwright nos fluxos principais e cobertura mínima em src/lib` |

Cerca de 13 arquivos, abaixo do limite de quebra (~25). Se a P1 for **(C)**, os testes de cobertura viram um 2º entregável (`test(lib): …`) antes do 1º.

## 10. Tarefas
| # | Entregável | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 1 | 1 | Instalar `@playwright/test` (estável atual) e `@vitest/coverage-v8` na versão exata do `vitest` como dev; scripts `test:coverage`, `e2e`, `e2e:instalar`; `ci` com `test:coverage` | dev-frontend | `package.json`, `package-lock.json` | — |
| 2 | 1 | `test.include` + bloco `coverage` (limiar conforme a P1) no `vite.config.ts`; rodar `npm run test:coverage` e registrar o resumo no checkpoint | dev-frontend | `vite.config.ts` | 1, **P1** |
| 3 | 1 | **Só se P1 = B ou C:** testes de borda nos arquivos com ramos abaixo do limiar, sem mudar cálculo, com valor explícito (`toBe`/`toBeCloseTo`), imitando `scenarios.test.ts` | dev-frontend | `src/lib/*.test.ts` (novos ou vizinhos de `supplies`, `sinapi`, `calendar`, `format`; com C, também `diagnosis`, `textDiff`) | 2 |
| 4 | 1 | `playwright.config.ts` (webServer de preview em 4173, Chromium, viewport 1440×900, `locale` pt-BR, reporters, trace/screenshot, retries) | dev-frontend | `playwright.config.ts` | 1 |
| 5 | 1 | Fixture de console (falha em `error`/`pageerror`) e helpers de seletor com escopo; E2E de navegação (C-6) | dev-frontend | `e2e/fixtures.ts`, `e2e/navegacao.spec.ts` | 4 |
| 6 | 1 | E2E de fluxos: C-1, C-2, C-3, C-7 | dev-frontend | `e2e/fluxos.spec.ts` | 5 |
| 7 | 1 | E2E de export/import: C-4, C-5 (download → filechooser) | dev-frontend | `e2e/fluxos.spec.ts` | 6 |
| 8 | 1 | Testes de store fixando N-1 a N-3 (mesmos números do E2E, para separar falha de motor de falha de tela) | dev-frontend | `src/stores/useProjectStore.test.ts` | 1 |
| 9 | 1 | `tsconfig.json`, `eslint.config.js`, `.gitignore`, `.dockerignore` | dev-frontend | os 4 arquivos | 4 |
| 10 | 1 | Job `e2e` e passo `test:coverage` no `ci.yml` (cache de navegador, `install-deps`, artefatos na falha); checkbox `npm run e2e` no template de PR | dev-frontend | `.github/workflows/ci.yml`, `.github/pull_request_template.md` | 4, 9 |
| 11 | 1 | Documentação: comandos e workflow (`docs/devops.md` §1, §2, §6); `README.md` (tabela de comandos); `CLAUDE.md` (comandos `test:coverage`/`e2e`, Testes = Vitest + Playwright, remover "Não há testes E2E" da dívida); `.claude/rules/testes.md` (última linha) e `divida-conhecida.md` (linha "Sem testes E2E") | dev-frontend | 6 arquivos de documentação | 10 |

Checkpoint após a tarefa 2 (arquivos e resumo da cobertura), conferido contra este plano antes de seguir. **`CLAUDE.md`:** há alterações não commitadas de outro trabalho nesta máquina (ADR 00001); a tarefa 11 edita só as linhas citadas, sem reverter nada.

### Grafo
`1 → 2 → 3*` · `1 → 4 → 5 → 6 → 7` · `1 → 8` · `4 → 9 → 10 → 11`. As tarefas 3, 5–7 e 8 podem andar em paralelo depois das dependências. (*) só com P1 = B ou C.

### Como rodar
- **Local (Windows/Git Bash ou PowerShell):** `npm ci` → `npm run e2e:instalar` (uma vez; baixa o Chromium para o perfil do usuário) → `npm run e2e` (gera o build, sobe o preview em 4173 e roda). Relatório: `npx playwright show-report`. Um teste: `npx playwright test e2e/fluxos.spec.ts -g "crashing"`. Cobertura: `npm run test:coverage` (HTML em `coverage/index.html`).
- **Se a rede corporativa bloquear o download do navegador:** registrar `NOT_RUN` local com o motivo; o job do CI vira a evidência. Não contornar o proxy.
- **CI:** o job `verify` roda `test:coverage` (o limiar bloqueia) e o job `e2e` roda em paralelo. Na falha, os artefatos ficam em *Actions › execução › Artifacts* (`playwright-report`, `test-results`).

## 11. Testes previstos
| Critério | Teste | Arquivo | Valor/resultado esperado |
|---|---|---|---|
| AC-1 | estado inicial | `e2e/fluxos.spec.ts` | 23/06/27, +16 d.u., SPI 0,89, CPI 0,93 |
| AC-2 | aprovar apontamento do Mestre Tião | `e2e/fluxos.spec.ts` | toast "Avanço 40% → 75%. Entrega antecipada em 5 dia(s) útil(eis)."; topo 16/06/27, +11 d.u. |
| AC-3 | aplicar crashing | `e2e/fluxos.spec.ts` | toast "Entrega: 23/06/27 → 18/06/27", R$ 12.617; topo 18/06/27, +13 d.u. |
| AC-4 | exportar XML válido | `e2e/fluxos.spec.ts` | toast de validação "29 tarefas, 24 vínculos"; arquivo com o nome do C-4, namespace MSPDI e 30 `<Task>` |
| AC-5 | importar o XML exportado | `e2e/fluxos.spec.ts` | toast "29 tarefas carregadas"; 0 toast de atenção; 23/06/27 |
| AC-6 | recarregar mantém o estado | `e2e/fluxos.spec.ts` | 75% e 16/06/27 depois do `reload` |
| AC-7 | navegar nos 6 módulos | `e2e/navegacao.spec.ts` | 6 `h1` e hashes; 0 `console.error`/`pageerror` |
| N-1 | seed | `src/stores/useProjectStore.test.ts` | `schedule.projectFinish` `'2027-06-23'`; `delay.delayDays` 16; `evm.spi` `toBeCloseTo(0.8883, 4)`; `evm.cpi` `toBeCloseTo(0.9349, 4)` |
| N-2 | aprovar r-tiao 75% | idem | retorno `{ delta: -5 }`; `projectFinish` `'2027-06-16'` |
| N-3 | crashing no seed | idem | `daysRecovered` 3; `extraCost` `toBeCloseTo(12616.8, 1)`; `projectFinish` `'2027-06-18'` |
| AC-8 | limiar de cobertura | `npm run test:coverage` | sai com 0 e o resumo mostra as métricas da P1 ≥ 80%; baixar um limiar acima do valor atual faz sair ≠ 0 (prova negativa feita uma vez e registrada) |
| AC-9 | Vitest não roda E2E | `npm test` | não lista nenhum arquivo de `e2e/` |

## 12. Critérios de aceite e escopo fechado
- **AC-1 a AC-7:** os 7 fluxos E2E da seção 11 passam localmente e no job `e2e` do CI.
- **AC-8:** `npm run test:coverage` aplica o limiar de 80% em `src/lib` (sem `download.ts`/`useMsProject.ts`) nas métricas da **P1** e quebra o `npm run ci` e o CI quando ele não é atingido.
- **AC-9:** `npm test` continua rodando só `src/**/*.test.ts`.
- **AC-10:** job "Testes E2E (Playwright)" no `ci.yml`, paralelo, só com actions oficiais, sem `permissions` novas, com cache de navegador medido (com e sem cache, tempos registrados no ciclo) e artefatos na falha; o CI total continua abaixo de 5 min (RNF-00.3) e o job "Lint, tipos, testes e build" mantém o nome.
- **AC-11:** imagem Docker inalterada: `docker build` + smoke test de `docs/devops.md` verdes; `actionlint` sem erro no `ci.yml`.
- **AC-12:** documentação atualizada (tarefa 11).

**P1 — PERGUNTA EM ABERTO (bloqueia as tarefas 2 e 3):** qual métrica entra no limiar de 80%? Hoje, sem `download.ts`/`useMsProject.ts`: linhas/instruções 89,98%, funções 87,40%, ramos 77,76%.
- **(A)** linhas, instruções e funções (global); ramos medidos sem bloquear. Sem testes novos.
- **(B)** as 4 métricas (global). Cerca de 22 ramos a mais cobertos, com testes de borda (tarefa 3). Recomendação (opinião).
- **(C)** as 4 métricas por arquivo. Muitos testes novos (`diagnosis.ts` e `textDiff.ts` em 0%); vira 2 entregáveis.

Itens previstos na matriz: `AC-1`…`AC-12`, `N-1`…`N-3`, `S-1` (licenças e `npm audit` das dependências novas), `S-2` (workflow sem permissão nova nem action de terceiro, `actionlint`), `S-3` (artefatos sem PII), `R-1` (nenhum arquivo de produção em `src/` alterado: `git diff --stat master -- src` só com `*.test.ts`), `V-1` (relatório HTML do Playwright anexado no PR de forma resumida).

**Fora do escopo:**
- Qualquer mudança em código de produção de `src/` (componentes, store, `src/lib`), inclusive `data-testid`. Se um fluxo não puder ser testado sem isso, ou se o E2E revelar um defeito (ex.: erro de console), o dev para e devolve: vira ciclo próprio.
- Firefox, WebKit, mobile e testes visuais por comparação de imagem.
- E2E contra o container Nginx e mudança no `Dockerfile` ou no workflow Docker.
- Incluir o job `e2e` nos checks obrigatórios da `master` (configuração do GitHub, feita por você).
- Multiobra, troca de obra, UF (00002) e qualquer número novo de cálculo.
- Publicar o relatório de cobertura em serviço externo, ou badge.
- Actions de terceiros, segredos e mudanças em `release.yml`, `docker.yml`, `codeql.yml` e `dependabot.yml`.
- Atualizar o `vitest` para a versão 5 (dívida conhecida; PR próprio).

## 13. Validações com outras áreas
| Tema | Área | Antes de quê |
|---|---|---|
| Licenças de `@playwright/test` (Apache-2.0), `@vitest/coverage-v8` (MIT) e transitivas (lista do `auditar-dependencias.mjs`) | Jurídico | Uso em produção (dependências só de desenvolvimento; não bloqueia o merge) |
| Dependências novas e download do Chromium/pacotes de sistema no CI | Segurança da Informação | Uso em produção; registrar no PR |
| Uso do GitHub Actions para este código (D3) | Infraestrutura + Segurança | Pendência já existente (SPEC-00); não muda com este ciclo |

## 14. Riscos e pós-entrega
- **Rollback:** reverter o commit. Nada no estado salvo nem no bundle muda.
- **Instabilidade (flaky):** debounce de 300 ms da gravação, componentes assíncronos e transições de toast. Espera por condição (`expect(...).toBeVisible()`, `expect.poll`), nunca `waitForTimeout`. Um teste que passar só na repetição é registrado no ciclo.
- **Números do E2E mudam a partir da 00004:** atualizar E2E e teste de store juntos, com antes e depois no PR.
- **Erro de console já existente:** se a navegação revelar um `console.error` real, o AC-7 falha. Não se corrige de passagem: o dev registra e o orquestrador decide com você (ciclo de correção antes ou tolerância documentada).
- **Tempo do CI:** se o job `e2e` passar de 5 min, primeiro tirar o cache inútil e confirmar `workers`; não cortar fluxo sem decisão.
- **Peer do `@vitest/coverage-v8`:** o Dependabot precisa subir os dois juntos (o grupo de dev já faz isso); PR que suba só um quebra o `npm ci`.
- **Depois do merge:** depois da 1ª execução verde na `master`, você pode incluir "Testes E2E (Playwright)" na proteção da branch.
