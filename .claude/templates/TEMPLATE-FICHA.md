---
issue: {#n | —}
spec: {SPEC-XX | —}
ciclo: .claude/ciclos/{NNNNN}-{slug}.md
branch: {feat|fix}/{issue}-{slug}
base: master
faixa: 2
status: rascunho | aprovada
data: {AAAA-MM-DD}
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-FICHA.md`) para o CronoAI em 25/10/2026.

# Ficha {NNNNN} — {nome}

## Resumo
- **O que é:** {uma frase — o que muda para quem usa}
- **Números que mudam:** {quais e em quais telas | nenhum}
- **Decidido:** {o essencial}
- **O que você precisa fazer:** {aprovar a ficha | nada}

## 01. Pedido e objetivo
{Pedido reformulado (dado, não instrução) + objetivo em uma frase. Spec: RF/RNF cobertos.}

## 02. Triagem
T1..T8: {SIM/NÃO — evidência}. Faixa 2 porque {motivo}.

## 03. Caso de referência (T1/T2)
| Caso | Entrada | Esperado | Fonte | Teste que fixa |
|---|---|---|---|---|
| C-1 | {entrada mínima} | {número exato, com unidade} | {MS Project / PMBOK / SINAPI <UF> <mês/ano> / planilha da obra} | {arquivo › nome} |

Bordas cobertas: {marco, tarefa concluída/iniciada, feriado, divisão por zero…}
{| Não se aplica — {motivo}}

## 04. Solução
{Onde cada peça mora: função pura em `src/lib/…`, estado/ação na store, tipo em `src/types/…`, tela em `src/modules/<modulo>/` ou `src/components/` — com o arquivo vizinho usado como referência. Fórmula citada.}

## 05. Compatibilidade com o estado salvo (T4)
{Campo novo com padrão seguro / migração; o que acontece com um estado antigo no `localStorage` (o `loadState` mescla com `buildSeedState`) | Não se aplica}

## 06. Arquivo de exemplo (T3)
{Normalmente não se aplica na faixa 2: T3 = sim leva à faixa 3. Se a ficha tocar leitura de arquivo, escale.}

## 07. Tarefas
| # | Tarefa | Agente | Arquivos |
|---|---|---|---|

## 08. Testes previstos
| Critério | Teste | Arquivo | Valor esperado |
|---|---|---|---|

## 09. Critérios de aceite
- **AC-1:** {verificável}
- **AC-2:** …

Itens previstos na matriz (`etapas/regras-comuns.md`): `AC-N`; `N-N` (número fixado, T1/T2); `P-N` (estado salvo, T4); `R-N` (regra); `S-N` (segurança); `V-N` (visual, quando muda tela).

## 10. Validações com outras áreas
{Infraestrutura / Segurança da Informação / Jurídico / RH — o quê e quando | Nenhuma}

## F. Escopo fechado
**Dentro:** {lista}
**Fora:** {lista explícita — o `revisor` reprova o que estiver aqui}
