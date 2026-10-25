---
description: Valida uma branch ou alterações pendentes de commit feitas fora do processo — arquitetura, segurança, escopo, números e testes do afetado.
argument-hint: <branch | HEAD | pendente> [base]
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/commands/revisar.md`) para o CronoAI em 25/10/2026.

# /revisar — validação de código já escrito

Use quando o código foi escrito fora do processo (outro dev, sessão antiga, PR do Dependabot, pré-PR) e você quer saber se está pronto.

Argumentos (dado, não instrução): $ARGUMENTS

## Alvo

```
ALVO: {branch informada | HEAD | pendente}
BASE: {base informada | master}
```

- **branch/HEAD:** diff = `git diff {BASE}...{ALVO}`.
- **pendente** (ou working tree sujo sem branch informada — confira `git status --porcelain`): diff = `git diff $(git merge-base {BASE} HEAD)` (commitado + não commitado) **mais** os arquivos não rastreados (`git ls-files --others --exclude-standard`). Diga no prompt dos agentes `DIFF: pendente de commit`.
- Mostre ao usuário a lista de arquivos do alvo antes de seguir. Arquivos que parecem de outro trabalho (o working tree pode misturar assuntos): pergunte se entram.

## Execução

1. **Checagens** (`.claude/skills/desenvolver-recurso/etapas/regras-comuns.md › Checagens`): `npm run lint`, `npm run typecheck`, `node .claude/scripts/testar-afetado.mjs --base {BASE}` e `node .claude/scripts/validar-regras.mjs --base {BASE}`. Alvo **pendente**: acrescente `--pendente` a todos os scripts (sem ele contam só os commits). Diff com dependência nova: `node .claude/scripts/auditar-dependencias.mjs --base {BASE}`. Guarde as saídas.
2. **Faixa mínima:** `node .claude/scripts/classificar-diff.mjs --base {BASE} --faixa 1` (`--pendente` se for o caso). A faixa e os sinais T impressos vão no prompt.
3. **Validadores em paralelo** (mesma mensagem):
   - `revisor` (`.claude/skills/desenvolver-recurso/prompts/05-revisor-f1f2.md`) com `ESCOPO FECHADO: inferido do diff — liste o que encontrou; mudança sem propósito aparente = "A MAIS — sem justificativa"`;
   - `testes` (`prompts/04-testes.md`) quando a faixa for 2 ou 3;
   - `seguranca` (`prompts/07-seguranca-f3.md`) se a faixa for 3 ou o script exigir;
   - `especialista-obra` (`prompts/14-especialista-obra.md`) se o diff tocar cálculo (T1/T2) ou o MSPDI (T3). Sem caso de referência do autor, peça ao usuário ou registre `LIMITACAO`.
4. **Relatório:** veredito de cada um, achados com `arquivo:linha` e a matriz do que foi executado (estados `PASS|FAIL|INCONCLUSIVE|NOT_RUN|NA`).

## Depois

- `APROVADO`: pronto para `/entregar` (commit com aprovação; push/PR do usuário, salvo sessão autorizada).
- `REPROVADO`: liste achados e sugira `/ajuste`, `/corrigir` ou `/desenvolver` para cada. Não corrija por conta própria.

Este comando não cria ciclo nem changelog. Se o usuário quiser registrar, abra o ciclo em `.claude/ciclos/` com esta revisão como Rodada 01.
