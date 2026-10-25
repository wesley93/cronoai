> Adaptado de Sophia.Escolar.Hibrido / SophIA (`etapas/faixa-3.md`) para o CronoAI em 25/10/2026.

# Faixa 3 — Completo

Leitura/escrita do MS Project ou formato de arquivo (T3), segurança e privacidade (T5), backend/autenticação/banco/integração externa (T8). É onde mora o risco de **perder dado na ida e volta com o MS Project**, de **aceitar arquivo malicioso** ou de **vazar dado de obra ou de trabalhador**.

## Etapas

### 1. Entender
Pedido, spec, código, ADRs em `.claude/adrs/` e as seções do `CLAUDE.md` (Invioláveis, Validações com outras áreas). Liste as premissas. Com T3, separe um arquivo de exemplo fictício ou anonimizado e o comportamento esperado no MS Project. Ambiguidade: pergunte agora.

### 2. Dados — `dba` (T8 com banco)
`prompts/01-dba-levantamento.md`: modelo, migração versionada, índices, impacto. Gate: `VEREDITO: OK`; `LACUNA`/`RISCO` vão ao usuário. Sem backend (hoje), esta etapa é `NA`.

### 3. Plano — `arquiteto`
`prompts/02-arquiteto-plano.md` grava `.claude/ciclos/{NNNNN}-{slug}-plano.md` (`TEMPLATE-PLANO.md`), com critérios de aceite, decisões, entregáveis (até 4; normalmente 1), tarefas, testes previstos (ida e volta MSPDI, validação com `strictOrder`, entradas maliciosas, limites de tamanho) e escopo fechado.

### 4. GATE do usuário — único
Apresente o plano: objetivo, critérios de aceite, decisões, entregáveis, testes, escopo fechado, riscos e o que precisa de validação de outra área (Segurança, Jurídico, Infra) antes de produção. **Aguarde aprovação explícita.**

### 5. Execução — um entregável por vez
`dev-frontend`/`dev-backend` (`prompts/03-devs-execucao.md`). Plano com mais de 5 tarefas: peça um checkpoint curto após a primeira (arquivos + decisão) e confira contra o plano antes de seguir.

### 6. Checagens e rede determinística
`regras-comuns.md › Checagens` + `node .claude/scripts/classificar-diff.mjs --base {BASE} --faixa 3` + `node .claude/scripts/auditar-dependencias.mjs` se houve pacote novo.

### 7. Validação em paralelo — mesma mensagem
- `testes` (`prompts/04-testes.md`) — escopo afetado + matriz
- `arquiteto` em revisão (`prompts/06-arquiteto-revisao-f3.md`) — aderência ao plano, camadas, convenções
- `seguranca` (`prompts/07-seguranca-f3.md`) — entrada externa, XXE, CSP, dependências, PII, permissões do CI; uma vez, sobre o diff final
- `especialista-obra` quando T1/T2/T3 = sim (MSPDI conferido contra o esquema e o comportamento do MS Project)
- `dba` em revisão quando houve banco (mesmo prompt de levantamento, `MODO: REVISAO`)

Gates: todos APROVADO; `seguranca` com Crítico/Alto/Médio bloqueia. Consolide e devolva numa passagem (`prompts/09-retorno.md`).

### 8. Auditoria independente — GATE
Com o lote aprovado: **agente novo** `revisor` em `MODO: AUDITAR` (`prompts/12-auditoria.md`), com o pedido original, o diff, a matriz e a evidência bruta — sem relatórios dos devs nem vereditos dos outros. Qualquer achado reprova até ser corrigido ou recusado pelo usuário com registro. Depois de correção: `testes` + auditoria em modo delta.

### 9. Ciclo — GATE
Rodada gravada em `.claude/ciclos/{NNNNN}-{slug}.md` com os vereditos de todos (inclusive `auditoria`) e a matriz inteira.

### 10. Encerramento
`/entregar` — um commit por entregável, cada um com aprovação. Mudança com dados pessoais, provedor externo ou hospedagem: lembre o usuário de validar com Segurança/Jurídico/Infra antes do merge na `master`.

Alvo: ~60 min por entregável, 5–7 agentes.
