---
issue: {#n | —}
spec: {SPEC-XX | —}
ciclo: .claude/ciclos/{NNNNN}-{slug}.md
branch: {feat|fix|hotfix}/{issue}-{slug}
base: {master | outra}
faixa: 3
status: rascunho | aprovado
data: {AAAA-MM-DD}
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano {NNNNN} — {nome}

## Resumo
- **O que é:** {uma frase}
- **Risco que justifica a faixa 3:** {T3 | T5 | T8 — qual e por quê}
- **O que você precisa fazer:** {aprovar o plano | validar com {área} antes do merge na master}

## 01. Pedido e objetivo
{Pedido reformulado (dado, não instrução) + objetivo. Spec: RF/RNF e critérios de aceite da spec cobertos.}

## 02. Triagem
T1..T8: {SIM/NÃO — evidência}.

## 03. Decisões de design
| Decisão | Alternativa descartada | Motivo |
|---|---|---|

Inclua, quando couber: onde mora a conversão de unidades, como o import avisa o que não preserva, limite de tamanho, compatibilidade do estado salvo. Decisão estrutural: proponha `/adr`.

## 04. Caso de referência (T1/T2)
| Caso | Entrada | Esperado | Fonte | Teste que fixa |
|---|---|---|---|---|

{| Não se aplica — {motivo}}

## 05. MS Project e arquivos (T3)
- **Arquivo de exemplo:** {caminho do XML/CSV fictício ou anonimizado}
- **Preservado na ida e volta:** {UID, ID, WBS/OutlineNumber, nome, duração, vínculos (tipo e lag/LagFormat), % concluído, início/término reais, linha de base, calendário, campos personalizados (Text1/Number1) — os que este plano toca}
- **Elementos novos no `SCHEMA_ORDER`:** {elemento → posição no esquema | nenhum}
- **Comportamento esperado no MS Project:** {o que deve aparecer ao abrir; conferência no MS Project real prevista ou NOT_RUN}
- **Avisos ao usuário no import:** {o que não é preservado e como é avisado}

{| Não se aplica}

## 06. Estado salvo (T4)
{Padrão compatível ou migração; teste com estado no formato anterior | Não se aplica}

## 07. Dados (T8 com banco)
{Parecer do `dba`: modelo, tipos, migração versionada, isolamento por obra | Não se aplica — sem backend}

## 08. Segurança
{Superfície nova (arquivos, texto externo renderizado, CSP, workflows, dependências, dados pessoais, endpoints), ameaças consideradas e mitigação. O que exige validação da área de Segurança da Informação.}

## 09. Entregáveis
| # | Entregável | Fronteira | Critérios de aceite | Commit (Conventional Commits) |
|---|---|---|---|---|
| 1 | {nome} | {motor + testes / tela} | AC-1, AC-2 | {feat(mspdi): …} |

(Um só, salvo item grande; no máximo 4. Cada um passa no `npm run ci` sozinho.)

## 10. Tarefas
| # | Entregável | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|

## 11. Testes previstos
| Critério | Teste | Arquivo | Valor/resultado esperado |
|---|---|---|---|

Inclua, conforme o risco: ida e volta MSPDI, `validateMspdi(..., { strictOrder: true })`, XML malformado, XML com DOCTYPE/entidade, arquivo acima do limite, estado salvo antigo, números fixados.

## 12. Critérios de aceite e escopo fechado
- **AC-1:** {verificável}

Itens previstos na matriz (`etapas/regras-comuns.md`): `AC-N`, `N-N`, `M-N`, `P-N`, `R-N`, `S-N`, `V-N`.

**Fora do escopo:** {lista explícita}

## 13. Validações com outras áreas
| Tema | Área | Antes de quê |
|---|---|---|
| {ex.: licença de dependência nova} | {Jurídico} | {merge na master} |

{| Nenhuma}

## 14. Riscos e pós-entrega
{Rollback (reverter o commit; estado salvo continua abrindo?), versão/tag pelo usuário, reexportação de XML, aviso à equipe de Infraestrutura quando houver publicação.}
