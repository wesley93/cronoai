> Adaptado de Sophia.Escolar.Hibrido / SophIA (`etapas/faixa-1.md`) para o CronoAI em 25/10/2026.

# Faixa 1 — Direto (o caminho comum)

Até 3 arquivos, sem cálculo (T1/T2), MS Project/arquivos (T3), estado persistido (T4), segurança (T5), IA de campo (T6), infraestrutura (T7) ou backend (T8). Texto, rótulo, CSS, ajuste visual de componente, bug localizado de tela. Sem ficha, sem plano.

**Regra-chave:** você implementa. Criar subagente custa mais que a mudança.

## Etapas

1. **Confirmação em uma linha:** arquivos a tocar e por que é faixa 1. Crie a branch (`SKILL.md › Base e branch`).
2. **Implemente.** As regras de `.claude/rules/` e as convenções do `CLAUDE.md` valem na íntegra (textos em português, formatação via `src/lib/format.ts`, classes utilitárias do `style.css`, nada de `v-html` com texto externo).
3. **Checagens** (`regras-comuns.md › Checagens`): `npm run lint`, `npm run typecheck` e `node .claude/scripts/testar-afetado.mjs --base {BASE}`.
4. **Rede determinística:** `node .claude/scripts/classificar-diff.mjs --base {BASE} --faixa 1`. Exigiu faixa maior: pare e siga `/desenvolver` com o mesmo pedido.
5. **Revisão:** um `revisor` em passe único (`prompts/05-revisor-f1f2.md`), com o pedido literal como escopo. Mudança só de texto/CSS sem lógica: o passe pode ser dispensado pelo usuário — registre a dispensa no ciclo.
6. **Ciclo:** grave `.claude/ciclos/{NNNNN}-{slug}.md` curto — Resumo + uma rodada com a matriz (no mínimo `AC-1` = o pedido literal, com evidência; `V-1` com captura/verificação visual quando muda tela).
7. **Encerramento:** `/entregar`.

**Escalada automática:** tocou cálculo, MSPDI/CSV, estado persistido, segurança, IA de campo, Docker/CI ou passou de 3 arquivos — pare, anuncie e siga pela faixa nova.

Sem auditoria independente (é da faixa 3). Alvo: ~10 minutos.
