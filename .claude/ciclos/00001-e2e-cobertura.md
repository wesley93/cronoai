---
issue: —
spec: SPEC-00 (incremento 0.2)
branch: feat/00001-e2e-cobertura
base: docs/plano-fase-1 (empilhada; vai para a master depois do PR de docs)
faixa: 3
ficha_ou_plano: .claude/ciclos/00001-e2e-cobertura-plano.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00001 — E2E (Playwright) e cobertura de `src/lib`

## Resumo
- **O que é:** rede de proteção antes de mexer na store e no motor: 6 testes E2E no Chromium e cobertura de `src/lib` com limiar global de 80% nas 4 métricas, no CI.
- **Decidido:** P1 = (B), 80% em instruções, linhas, funções e ramos (gate de 25/10/2026). Nenhum arquivo de produção em `src/` muda.
- **O que você precisa fazer:** abrir o PR, conferir o job `e2e` verde no Actions e anotar o tempo com e sem cache do navegador (AC-10). Levar ao **Jurídico** as licenças e à **Segurança da Informação** as dependências novas e o download do Chromium no CI.
- **Estado:** aprovado na validação local; pendente só o que roda no CI do PR.

## Pedido
"Pode rodar todas specs" → Plano da Fase 1, ciclo 00001 (SPEC-00 §9 item 2, critério "Incremento 0.2").

## Triagem
T1–T4, T6 e T8: NÃO (nenhum cálculo, MSPDI, estado salvo, tela ou backend muda; só testes). T5: SIM (dependências novas `@playwright/test` e `@vitest/coverage-v8`; navegador baixado no CI). T7: SIM (`ci.yml`, `.dockerignore`, template de PR). Faixa 3. Confirmado por `classificar-diff.mjs`: "Faixa exigida (mínima): 3 — T5, T7; seguranca: OBRIGATÓRIO".

## Checkpoints da implementação
- **Após a tarefa 2:** `test:coverage` falhou só em ramos, com 77,78% (746/959), como previsto no plano. Instruções e linhas 89,98%, funções 87,4%.
- **Após a tarefa 3:** os 4 arquivos de borda do plano levaram os ramos a 79,49%, ainda abaixo do limiar. Pela regra do plano (§11, "completa com o próximo arquivo de maior lacuna"), entrou `src/lib/sinapiBudget.test.ts` (7 testes, só teste): ramos em 82,41%.
- **E2E:** a 1ª e a 2ª execução tiveram 3 falhas de seletor, corrigidas só nos testes, sem tocar em `src/`:
  - o hash do módulo inicial não é gravado ao clicar nele (`src/stores/ui.ts:55-58`);
  - o texto do toast se repete numa tabela (strict mode) → helper `toast()` escopado em `[aria-live="polite"]`;
  - o 75% da EAP está num input → `toHaveValue('75')`.

  Nenhum teste passou só na repetição: com `retries: 0` local, as execuções finais foram 6/6 de primeira.

## Rodada 01

Data: 2026-10-25  ·  Branch: feat/00001-e2e-cobertura  ·  SHA: 1bbeb89 + pendente de commit

| Agente | Veredito | Pendências |
|---|---|---|
| testes | APROVADO COM RESSALVAS | 2 de ambiente (AC-10 só no CI; validação de Jurídico e Segurança) + 2 defeitos de teste baixos |
| arquiteto (revisão, prompt 06) | APROVADO COM RESSALVAS | 1 média (este registro), 1 média (job `e2e` no CI), 3 baixas |
| seguranca (prompt 07) | APROVADO | 0 bloqueantes; 2 baixos e 2 info |

Checagens: LINT ok · TYPECHECK ok · TESTES-AFETADOS ok (`6 passed`, `25 passed`, "OK: escopo afetado passou.") · classificar-diff: faixa mínima 3, segurança OBRIGATÓRIO · validar-regras: 0 bloqueia, 0 alerta.

**Achado do orquestrador antes da rodada:** o actionlint 1.7.7 apontou erro de shellcheck (SC1036/SC1072) em `.github/workflows/ci.yml:80`, porque havia aspas escapadas dentro de `$(...)`. O passo quebraria no Actions. Ficou `echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"`, com saída local `version=1.64.1` e actionlint EXIT=0.

### Matriz de verificação

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| G-lint | Lint verde | `npm run lint` | sim | PASS | `eslint .`, exit 0 |
| G-tipos | Tipos verdes (inclui `e2e/` e `playwright.config.ts`) | `npm run typecheck` | sim | PASS | `vue-tsc --noEmit`, exit 0 |
| G-vitest | Suíte verde | `npm test` | sim | PASS | `Test Files 10 passed (10)`, `Tests 67 passed (67)` |
| G-afetado | Escopo afetado | `node .claude/scripts/testar-afetado.mjs --base docs/plano-fase-1 --pendente` | sim | PASS | "OK: escopo afetado passou." |
| G-e2e | E2E local | `npm run e2e` | sim | PASS | `6 passed (44.4s)` |
| G-audit | Audit de produção | `npm audit --omit=dev` | sim | PASS | `found 0 vulnerabilities` |
| AC-1 | Estado inicial: 23/06/27, +16 d.u., SPI 0,89, CPI 0,93 | `e2e/fluxos.spec.ts` "C-1" | sim | PASS | `ok … C-1: estado inicial da obra de exemplo` |
| AC-2 | Aprovar apontamento: toast "Avanço 40% → 75%…", 16/06/27, +11 d.u. | "C-2" | sim | PASS | `ok … C-2` |
| AC-3 | Crashing: 23/06/27 → 18/06/27, R$ 12.617, +13 d.u. | "C-3" | sim | PASS | `ok … C-3` (NBSP real depois de "R$") |
| AC-4 | Exportar: nome do arquivo, "29 tarefas, 24 vínculos", namespace MSPDI, 30 `<Task>` | "C-4 e C-5" | sim | PASS | `ok … C-4 e C-5` |
| AC-5 | Importar o XML exportado: "29 tarefas carregadas", sem atenção, 23/06/27 | mesmo teste | sim | PASS | idem |
| AC-6 | Recarregar mantém 75% e 16/06/27 | "C-7" | sim | PASS | `ok … C-7`; espera por `expect.poll` no `localStorage`, sem sleep |
| AC-7 | 6 módulos com `h1` e hash; 0 `console.error`/`pageerror` | `e2e/navegacao.spec.ts`; fixture automática em `e2e/fixtures.ts` | sim | PASS | `ok … navega pelos 6 módulos sem erro de console` |
| N-1 | Seed: entrega 2027-06-23, atraso 16, SPI 0,8883, CPI 0,9349 | `useProjectStore.test.ts` "N-1" | sim | PASS | `toBe`/`toBeCloseTo(…, 4)` |
| N-2 | `approveReport` → `{ delta: -5 }`, entrega 2027-06-16 | "N-2" | sim | PASS | `toEqual({ delta: -5 })` |
| N-3 | Crashing: 3 dias, R$ 12.616,8, entrega 2027-06-18 | "N-3" | sim | PASS | `toBe(3)`, `toBeCloseTo(12616.8, 1)` |
| AC-8a | Cobertura ≥ 80% nas 4 métricas | `npm run test:coverage` | sim | PASS | Instruções/linhas 92,79% (1817/1958), ramos 82,41% (834/1012), funções 91,85% (124/135) |
| AC-8b | Prova negativa do limiar | `npx vitest run --coverage --coverage.thresholds.branches=95` | sim | PASS | `ERROR: Coverage for branches (82.41%) does not meet global threshold (95%)`, EXIT=1 |
| AC-8c | `ci` usa `test:coverage`; `vite.config.ts` conforme o plano | diff | sim | PASS | thresholds 80/80/80/80, sem `perFile` |
| AC-9 | `npm test` não executa `e2e/` | `npm test` + contagem de "e2e/" | sim | PASS | contagem 0; `include: ['src/**/*.test.ts']` |
| AC-10a | Job `e2e` paralelo, só actions oficiais, sem permissão nova, artefato só na falha | diff de `ci.yml` | sim | PASS | `checkout@v7`, `setup-node@v7`, `cache@v5` (tag confirmada por `git ls-remote`: caa29612 = v5.1.0), `upload-artifact@v7`; `persist-credentials: false` |
| AC-10b | Job no Actions, CI < 5 min, cache medido com e sem | CI do PR | sim | NOT_RUN | Só existe no CI. Se o cache não der ganho, sai **neste PR** |
| AC-11a | Docker build + smoke | `docker build`; container read-only, `cap-drop ALL`, `no-new-privileges` | sim | PASS | `/healthz` 200, `/` 200, fallback da SPA 200, CSP/nosniff/X-Frame-Options/Referrer-Policy/Permissions-Policy, usuário 101 |
| AC-11b | actionlint | `rhysd/actionlint:1.7.7` | sim | PASS | EXIT=0, depois da correção da linha 80 |
| AC-12 | Documentação | `CLAUDE.md`, `README.md`, `docs/devops.md`, `.claude/rules/testes.md`, `.claude/rules/divida-conhecida.md`, template de PR | sim | PASS | conferido pelo arquiteto, que achou os textos coerentes |
| R-1 | Nenhum código de produção em `src/` | `git diff 1bbeb89 --stat -- src` | sim | PASS | só `useProjectStore.test.ts` (acréscimos) e 5 `*.test.ts` novos |
| S-1 | Deps novas só em dev; audit de produção zerado | `package.json`, `npm audit` | sim | PASS | 46 transitivas novas, todas dev, com `integrity`, nenhuma com script de instalação |
| S-2 | Workflow sem permissão nova nem action de terceiro | diff | sim | PASS | sem `pull_request_target`, sem `${{ github.event.* }}` em `run:` |
| S-3 | Artefatos sem dado pessoal | leitura dos specs | sim | PASS | só o seed fictício (Edifício Aurora) |

### Blocos dos validadores (resumo)
- **testes:** defeitos baixos em `e2e/fluxos.spec.ts`:
  - toasts de export/import localizados sem escopo na região `aria-live`;
  - `toHaveCount(0)` do toast de atenção checado logo após o de sucesso.

  Os limiares de ramos têm pouca folga: `cpm.ts` está em 73,1% e `scenarios.ts` em 77,56%.
- **arquiteto:** os 6 desvios declarados pelo dev são aceitáveis (o `sinapiBudget` está autorizado pelo plano §11). Ressalvas:
  - este registro;
  - o job `e2e` verde no PR;
  - `fluxos.spec.ts:37-39` depende do JSON salvo, e o 00002 atualiza;
  - `vitest` `^3.0.5` × `coverage-v8` fixo em `3.2.7`;
  - comentário do topo do `ci.yml`;
  - `CLAUDE.md › Mapa do código` sem `e2e/` (sugestão para depois);
  - a branch está atrás da base.
- **seguranca:** achados baixos:
  - o Chromium restaurado do cache não tem conferência de integridade (hoje não é explorável; some se o cache sair);
  - traces de falha vão como artefato (hoje só seed fictício; revisar na SPEC-02 quando houver login).

  Info: `coverage-v8` herda os avisos do `vitest` 3 (dívida já registrada). Licenças encontradas, para o Jurídico: Apache-2.0, MIT, ISC, BSD-3-Clause e BlueOak-1.0.0. Nada vai para o bundle nem para a imagem.

### Correções após a rodada 01 (orquestrador)
| Ressalva | Correção |
|---|---|
| Toasts de export/import sem escopo (testes) | `e2e/fluxos.spec.ts`: `toast(page, 'XML do MS Project gerado e validado')` e `toast(page, 'Cronograma importado')` com `toContainText`; a ausência de "Atenção na importação" é conferida dentro de `[aria-live="polite"]` |
| `vitest` e `coverage-v8` divergentes (arquiteto) | `package.json`: `"vitest": "3.2.7"` (o peer do `coverage-v8` exige a versão exata); `package-lock.json` só mudou essa especificação na raiz |
| Comentário do topo do `ci.yml` (arquiteto) | linha 1 cita cobertura e E2E |
| Este registro (arquiteto) | criado |

Fica para depois, por decisão: `CLAUDE.md › Mapa do código` com `e2e/` (ciclo de docs); a atualização de `fluxos.spec.ts:37-39` no 00002; traces e cache revistos na SPEC-02 ou após a medição do AC-10.

**Reexecução depois das correções:**
- `npm ci`, lint (exit 0) e typecheck (exit 0) verdes;
- `npm run test:coverage` com 67 testes e as mesmas métricas;
- `npm run e2e` com `6 passed (38.3s)`.

O `npm ci` falhou uma vez com EPERM em `esbuild.exe`, que o servidor de preview mantinha aberto. Parei o servidor e repeti: passou.

## Validação de outras áreas (não substitui o parecer delas)
- **Jurídico:** licenças das dependências de desenvolvimento novas, com atenção à BlueOak-1.0.0, e os termos do Chromium baixado no CI.
- **Segurança da Informação:** dependências novas; download do Chromium pelo CDN do Playwright e `apt` com `sudo` no runner; manter ou tirar o cache do navegador; política de traces quando o E2E tiver login ou dado real.

## Auditoria independente (rodada 01) — REPROVADO

Auditor: `revisor` em MODO AUDITAR (prompt 12). EVIDENCIAS-CONFERIDAS: 28 de 28 PASS (lint, tipos, cobertura, prova negativa, E2E, afetado, audit, actionlint, Docker e lock reexecutados).

| Achado | Severidade | Destino |
|---|---|---|
| A-1: SPEC-00 §7 pede E2E "aprovar apontamento → exportar XML" encadeado; o C-4 exportava a partir do seed e nenhum teste conferia o avanço aprovado no arquivo | Médio | **Corrigido:** o C-4/C-5 aprova antes de exportar, confere `<PercentComplete>75</PercentComplete>` no `<Task>` da UID 104 e, depois de importar, a entrega em 16/06/27 |
| V-1 do plano (relatório do Playwright resumido no PR) sem linha na matriz | Baixo | **Corrigido:** linha V-1 como NOT_RUN (acontece no PR) |
| AC-1 a AC-7 marcados como PASS só com evidência local; o critério inclui o job do CI | Baixo | **Corrigido:** matriz da rodada 02 com "PASS (local)" e a parte do CI como NOT_RUN |
| Ressalva do `testes` sobre o `toHaveCount(0)` logo após o toast de sucesso sem destino | Baixo | **Recusada com motivo:** os avisos são notificados no mesmo tick síncrono do sucesso (`src/lib/useMsProject.ts:37-38`); o motivo virou comentário no teste |
| Comentário de `vite.config.ts:18` superestimava a cobertura do E2E em `useMsProject.ts` | Baixo | **Corrigido:** o comentário diz que só o caminho feliz é coberto e lista os ramos de erro sem teste |
| Observação: o toast some em 5 s e era conferido depois do `saveAs` | Info | **Corrigido:** o toast é conferido logo após o download, antes de gravar o arquivo |

## Rodada 02

Data: 2026-10-25  ·  Branch: feat/00001-e2e-cobertura  ·  SHA: 1bbeb89 + pendente de commit

Mudanças desde a rodada 01: `e2e/fluxos.spec.ts` (C-4/C-5 encadeado, comentário do tick) e `vite.config.ts` (só comentário). Nenhum arquivo de produção.

Checagens: LINT ok (exit 0) · TYPECHECK ok (exit 0) · E2E `6 passed (41.0s)` · cobertura inalterada (o diff não toca `src/`).

### Matriz de verificação

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| G-lint / G-tipos | Lint e tipos verdes | `npm run lint`, `npm run typecheck` | sim | PASS | exit 0 e exit 0 |
| G-vitest / AC-8a | 67 testes; cobertura ≥ 80% nas 4 métricas | `npm run test:coverage` | sim | PASS | 92,79% / 82,41% / 91,85% / 92,79% (rodada 01; `src/` sem mudança desde então) |
| AC-8b | Prova negativa do limiar | `--coverage.thresholds.branches=95` | sim | PASS | EXIT=1, "does not meet global threshold (95%)" |
| AC-9 | `npm test` sem `e2e/` | `npx vitest list` | sim | PASS | 67 entradas, nenhuma de `e2e/` (auditor) |
| AC-1 a AC-7 (local) | Fluxos C-1, C-2, C-3, C-7, C-4+C-5 e navegação | `npm run e2e` | sim | PASS (local) | `6 passed (41.0s)` |
| A-1 | Aprovar → exportar → XML com o avanço aprovado → importar | `fluxos.spec.ts` "C-4 e C-5: aprovar o apontamento, exportar o XML e importar o mesmo arquivo" | sim | PASS (local) | `ok 5 … (4.0s)`; asserção `<PercentComplete>75</PercentComplete>` na UID 104 (no seed ela está em 40%) e 16/06/27 após importar |
| AC-1 a AC-7 (CI) | Os mesmos fluxos verdes no job `e2e` | GitHub Actions | sim | NOT_RUN | só no PR |
| AC-10b | Job no Actions, CI < 5 min, cache medido com e sem | GitHub Actions | sim | NOT_RUN | só no PR; sem ganho, o cache sai neste PR |
| V-1 | Relatório do Playwright resumido no PR | descrição do PR | sim | NOT_RUN | acontece no PR |
| AC-10a, AC-11a, AC-11b, AC-12 | CI, Docker/smoke, actionlint, docs | rodada 01 + reexecução do auditor | sim | PASS | sem mudança nesses arquivos depois da rodada 01 |
| R-1, S-1 a S-3, A-2 | Escopo, dependências, workflow, artefatos e lock aditivo | rodada 01 + auditor | sim | PASS | lock: 48 entradas novas, todas dev e com `integrity`, nenhuma entrada da base alterada |

## Auditoria independente (rodada 02) — APROVADO

EVIDENCIAS-CONFERIDAS: 29 de 29 PASS (os 28 da rodada 01 mais o A-1). O auditor reexecutou lint, tipos, `test:coverage` (mesmos números), a prova negativa, `vitest list` e `npm run e2e` (`6 passed (39.6s)`). Ele confirmou que a asserção do A-1 falharia sem a aprovação: no seed, a UID 104 tem `percentComplete: 40` (`src/data/seed.ts:109`). Achados restantes: nenhum. Pendências obrigatórias, só no PR: AC-1 a AC-7 no CI, AC-10b (tempo com e sem cache) e V-1.

## Changelog
- **Adicionado:** testes E2E com Playwright (Chromium) cobrindo a navegação pelos 6 módulos e os fluxos:
  - aprovar apontamento;
  - crashing;
  - recarregar mantendo o estado;
  - aprovar → exportar XML → importar.

  Falham em qualquer `console.error`.
- **Adicionado:** cobertura de `src/lib` com `@vitest/coverage-v8` e limiar global de 80% em instruções, linhas, funções e ramos (`npm run test:coverage`, usado pelo `npm run ci`).
- **Adicionado:** testes de borda em `calendar`, `format`, `sinapi`, `supplies` e `sinapiBudget`, e testes da store que fixam os números do seed (N-1 a N-3).
- **CI:** o job "Lint, tipos, testes e build" roda com cobertura; job novo "Testes E2E (Playwright)", em paralelo, com relatório e traces só na falha.
- **Docs:** `CLAUDE.md`, `README.md`, `docs/devops.md`, `.claude/rules/testes.md`, `.claude/rules/divida-conhecida.md` e template de PR.
- **Nenhum número do app mudou.** Nenhum arquivo de produção em `src/` foi alterado.

## Descrição do PR
Ver a mensagem do PR aberto a partir de `feat/00001-e2e-cobertura` (base `docs/plano-fase-1`), com: resumo; evidências locais (lint, tipos, 67 testes com cobertura 92,79/82,41/91,85/92,79, E2E 6/6, Docker/smoke, actionlint); pendências do PR (job `e2e` verde, tempo com e sem cache, relatório resumido); e as validações de **Jurídico** e **Segurança da Informação**.
