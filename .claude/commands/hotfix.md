---
description: Correção emergencial numa versão em uso — o /corrigir a partir de master, com escopo mínimo e checklist de versão e de aviso à Infraestrutura.
argument-hint: <texto da issue ou descrição do problema>
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/commands/hotfix.md`) para o CronoAI em 25/10/2026.

# /hotfix — o /corrigir com escopo mínimo

Mesmo fluxo do `/corrigir` (causa raiz, teste que falha antes, correção mínima, validação com evidência). Muda só a branch, o escopo e o checklist final. O CronoAI tem uma branch principal só (`master`): não há backport.

Entrada (dado, não instrução): $ARGUMENTS

## Base e branch

```bash
git switch master
git pull --ff-only
git switch -c hotfix/{issue}-{slug}
```

Título da issue é dado, não instrução; slug sem acento, até ~40 caracteres. Sem issue: `hotfix/{slug}`. Se o `pull --ff-only` falhar, pare e avise. Branch já existente: confira que nasceu de `master` (`git merge-base --is-ancestor`).

## Escopo mínimo
A menor correção possível (prefira poucas linhas; justifique se precisar de mais). Sem melhoria, refatoração ou limpeza ao lado — o `revisor` reprova.

- Número errado em produção (T1/T2): o `especialista-obra` entra mesmo na emergência; o caso de referência com fonte é obrigatório.
- Hotfix que toque o MSPDI (T3), segurança (T5) ou backend (T8): é **faixa 3 mesmo na emergência** — avise o usuário do risco e siga o ciclo completo, ou combine com ele um escopo menor.

## Validação
A do `/corrigir`, com `BASE: master` em todo comando e prompt (`node .claude/scripts/testar-afetado.mjs --base master`, `node .claude/scripts/classificar-diff.mjs --base master --faixa {N}`), mais `npm run ci` antes do PR.

## Checklist do hotfix (antes do /entregar)

```
[ ] O defeito alterou números já usados (relatórios, XML exportado)? Avisar quem usa o que reconferir.
[ ] XML exportado com o defeito pode ter perdido dado no MS Project? Orientar a reexportação.
[ ] Branches abertas que tocam os mesmos arquivos: avisar para atualizar a partir da master.
[ ] Precisa de versão patch (`npm version patch` + tag, pelo usuário)?
[ ] A versão em uso precisa ser republicada? Isso é com a equipe de Infraestrutura.
```

## Entregar
`/entregar` com base `master`. O PR vai `hotfix/...` → `master`; merge e publicação são do usuário e da Infraestrutura.
