# `.claude/` — processo de desenvolvimento do CronoAI

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/`) para o CronoAI em 25/10/2026: mesmas faixas de risco, agentes, gates e evidência, trocando o domínio (chat escolar em .NET) pelo de planejamento de obras (Vue 3 + MS Project). Fonte da verdade: `CLAUDE.md` na raiz — em conflito, vale ele.

## Como usar

| Quero… | Comando |
|---|---|
| Desenvolver um recurso (gate na ficha/plano e no commit) | `/desenvolver <pedido, issue ou spec>` |
| Ajuste pequeno de tela/texto (faixa 1, até 3 arquivos) | `/ajuste <pedido>` |
| Corrigir um bug (causa raiz + teste que falha antes) | `/corrigir <defeito>` |
| Emergência numa versão em uso | `/hotfix <problema>` |
| Só avaliar um pedido/spec, ou só a faixa | `/avaliar-spec <spec>` · `/triagem <tarefa>` |
| Entender o código sem alterar nada | `/investigar <pergunta>` |
| Validar código escrito fora do processo | `/revisar <branch \| pendente> [base]` |
| Continuar um ciclo numa sessão nova | `/retomar [número]` |
| Encerrar: changelog, commit e PR propostos | `/entregar` |
| Registrar uma decisão de arquitetura | `/adr <título>` |

Fluxo: avaliar → triagem T1–T8 (faixas 1/2/3) → ficha/plano → gate do usuário → implementação → validação com evidência → `/entregar`. Commit só com aprovação; push e PR do usuário (ou da sessão que ele autorizar), pelo link `https://github.com/wesley93/cronoai/pull/new/<branch>`. Publicação e hospedagem: com a equipe de Infraestrutura.

## O que existe

| Pasta / arquivo | Conteúdo |
|---|---|
| `skills/desenvolver-recurso/` | `SKILL.md` (fluxo, triagem, DoR), `etapas/` (faixa-1, faixa-2, faixa-3, regras-comuns) e `prompts/` (modelos de delegação: 00 regras comuns, 01 dba, 02 arquiteto-plano, 03 devs, 04 testes, 05 revisor, 06 arquiteto-revisão, 07 segurança, 09 retorno, 12 auditoria, 14 especialista-obra) |
| `agents/` | `arquiteto`, `dev-frontend`, `dev-backend` e `dba` (a partir da SPEC-01), `especialista-obra` (fórmulas e números: CPM, EVM, cenários, DLP, SINAPI, MSPDI), `testes`, `revisor`, `seguranca` |
| `commands/` | os comandos da tabela acima |
| `docs/contrato-de-saida-agentes.md` | o que cada agente devolve; estados `PASS \| FAIL \| INCONCLUSIVE \| NOT_RUN \| NA` |
| `rules/` | regras carregadas por caminho: `frontend-geral`, `testes`, `divida-conhecida`, `calculo-precisao`, `msproject-mspdi`, `docker-ci` |
| `checklists/` | `qualidade.md` e `seguranca.md` (fonte única para revisor/arquiteto/segurança) |
| `templates/` | ciclo, ficha (faixa 2), plano (faixa 3) e changelog |
| `scripts/` | Node (`.mjs`), só leitura: `classificar-diff`, `validar-regras`, `testar-afetado`, `auditar-dependencias`, `gerar-changelog`, `hook-pos-edicao` — ver `scripts/README.md`. Antes do commit, use `--pendente` |
| `ciclos/` | evidência de cada ciclo: `{NNNNN}-{slug}.md` (+ `-ficha.md` / `-plano.md`) |
| `adrs/` | decisões de arquitetura e o índice (`adrs/README.md`) |
| `settings.proposta.json` | **proposta, não ativa**: permissões (leitura, `npm run lint/typecheck/test/ci/build`, scripts, git só leitura, Docker; `ask` para commit/push; `deny` para `.env*`, chaves e comandos destrutivos) e hook pós-edição. Para ativar, revise e renomeie (ou mescle) para `.claude/settings.json` |
| `launch.json` | servidor do painel de preview: `cronoai` (`npm run dev`, porta 5180) |

## Diferenças em relação ao SophIA

- `conhecimento` (RAG do chat) virou `especialista-obra`; o sinal T7 passou a ser Docker/CI e a precisão de cálculo (T1/T2) aciona o especialista em qualquer faixa.
- Sem Azure DevOps (`/card`, `ado.ps1`): repositório no GitHub, branch única `master`, sem backport.
- Sem deploy nem reingestão no `/entregar`: o checklist é CI verde, Docker verde e validações com outras áreas.
- Regras de backend, SQL, tenant e painel do SophIA não se aplicam (não há backend até a SPEC-01).
