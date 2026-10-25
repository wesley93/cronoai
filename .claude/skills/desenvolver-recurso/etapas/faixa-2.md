> Adaptado de Sophia.Escolar.Hibrido / SophIA (`etapas/faixa-2.md`) para o CronoAI em 25/10/2026.

# Faixa 2 — Médio

Cálculo de datas (T1), cálculo financeiro/quantidades (T2), estado persistido (T4), IA de campo (T6) ou Docker/CI (T7), **sem** T3/T5/T8; ou mudança sem esses sinais em mais de 3 arquivos. O `revisor` cobre segurança completa (bloco B) — tamanho não é motivo para faixa 3.

## Etapas

### 1. Entender
Pedido, spec relacionada e código relevante. Ambiguidade que muda escopo: pergunte agora, numa rodada só. Com T1/T2: escreva o **caso de referência** (entrada → número esperado e de onde vem).

### 2. Ficha — GATE
`arquiteto` (`prompts/02-arquiteto-plano.md`) grava `.claude/ciclos/{NNNNN}-{slug}-ficha.md` com `.claude/templates/TEMPLATE-FICHA.md`. Antes de apresentar, confira: **critérios de aceite**, **escopo fechado** (o que fica fora), **testes previstos** (com os números fixados quando T1/T2) e, com T4, a **compatibilidade com o estado salvo**. Faltou: devolva ao `arquiteto`.

Apresente ao usuário e **aguarde aprovação explícita**. Ajuste pedido volta ao `arquiteto`.

`/corrigir`: não há ficha — a causa raiz + teste que falha, aprovados, fazem o papel dela.

### 3. Execução
`dev-frontend` (e `dev-backend` quando houver backend) com `prompts/03-devs-execucao.md`, em paralelo quando não houver dependência (normalmente o motor em `src/lib` e os testes primeiro; tela depois).

### 4. Checagens e rede determinística
`regras-comuns.md › Checagens`, depois `node .claude/scripts/classificar-diff.mjs --base {BASE} --faixa 2`. Vermelho volta aos devs sem acionar validador. Com T7: `docker build` local e o smoke test do `docs/devops.md`.

### 5. Validação em paralelo
Na mesma mensagem: `revisor` (`prompts/05-revisor-f1f2.md`) e `testes` (`prompts/04-testes.md`); `especialista-obra` se T1/T2 = sim (`prompts/14-especialista-obra.md`); `seguranca` se o `classificar-diff` exigir.

Gates: `revisor` APROVADO + escopo ADERENTE; `testes` APROVADO com a matriz; `especialista-obra` APROVADO. Reprovou: retorno consolidado (`prompts/09-retorno.md`), e o `testes` roda de novo.

### 6. Ciclo — GATE
Grave a rodada em `.claude/ciclos/{NNNNN}-{slug}.md` (vereditos + matriz inteira). Correção acrescenta `## Rodada 02`.

### 7. Encerramento
`/entregar`.

Alvo: 25–40 min, 3–4 agentes (`arquiteto`, dev, `revisor`, `testes`; + `especialista-obra` com T1/T2).
