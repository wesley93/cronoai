> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/skills/desenvolver-recurso/prompts/12-auditoria.md`) para o CronoAI em 25/10/2026.

# Prompt — Auditoria independente (faixa 3)

**Por que existe:** dentro do fluxo, o revisor recebe a narrativa dos devs e tende a confirmá-la. A auditoria reproduz as condições de uma sessão nova: lê o pedido original e a evidência bruta, não a interpretação.

**Quando:** faixa 3, depois que o lote de validação aprovou, e de novo (modo delta) depois de toda correção. Nas faixas 1 e 2 só se o usuário pedir.

**Independência:**
- **Agente novo** (`subagent_type: revisor`), nunca `SendMessage` a um revisor que já participou.
- **Não** cole relatório de dev, resumo do orquestrador nem veredito de outro validador.
- Insumo que faltar: escreva `LIMITACAO: {o quê}` — o auditor registra no veredito.

```
MODO: AUDITAR
FAIXA: 3
TRIAGEM: {sinais T com SIM}
BASE: {master | outra}
BRANCH: {branch}
SHA: {git rev-parse HEAD}
{DIFF: pendente de commit — se for o caso}
{DELTA: {sha da rodada anterior} — só em reauditoria}

ESPECIFICAÇÃO ORIGINAL (fonte, não interpretação):
{texto literal do pedido / issue / spec (RF/RNF) + caminho do plano (critérios de aceite)}

{Com T1/T2 — CASO DE REFERÊNCIA: {entrada → número esperado → fonte}}
{Com T3 — ARQUIVO DE EXEMPLO: {caminho}}

MATRIZ DA RODADA (como gravada em .claude/ciclos/{NNNNN}-{slug}.md):
{colar a tabela}

EVIDÊNCIA BRUTA (caminhos ou trechos literais, não resumos):
- LINT / TYPECHECK / TESTES-AFETADOS: {…}
- npm run ci: {…}
- docker build + smoke test / actionlint (T7): {… | NA}

{LIMITACAO: …}

TAREFA: auditoria adversarial conforme a definição do agente revisor (modo AUDITAR).
Cada PASS da matriz: a evidência sustenta? Cada critério de aceite: está implementado e
provado? Cada número do caso de referência: há asserção exata com esse valor? Algo do
pedido ficou sem linha na matriz? Algo no diff não foi pedido?
Pode reexecutar no máximo UM teste focado por achado (`npx vitest run {arquivo} -t "{nome}"`);
nunca suíte completa.

Termine com VEREDITO: APROVADO | REPROVADO, LIMITACOES, ACHADOS (severidade, requisito,
evidência, como reproduzir), MATRIZ-EXTRA (linhas novas para a matriz), e
EVIDENCIAS-CONFERIDAS: {n} de {m PASS recebidos}.
```

**Gate:** `APROVADO` com `n = m`. Qualquer achado, inclusive Baixo, reprova até ser corrigido ou recusado pelo usuário com registro no ciclo. Achado volta por `prompts/09-retorno.md`.
