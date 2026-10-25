---
paths:
  - "src/**/*.vue"
  - "src/**/*.ts"
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/rules/frontend-geral.md`) para o CronoAI em 25/10/2026.

# Front (Vue 3 + Vite + TypeScript + Pinia + Tailwind + Chart.js)

Fonte da verdade: `CLAUDE.md` › **Stack e comandos** e › **Convenções**. Cálculo: ver também `calculo-precisao.md`; MS Project: `msproject-mspdi.md`.

## Organização

- **`src/lib`**: funções puras e testáveis. Nada de store, DOM ou `localStorage` (exceções: `download.ts`, `useMsProject.ts`). Fórmula citada no comentário.
- **`src/types`**: tipos de domínio (`domain.ts`) e visão MS Project (`msProject.ts`), importados com `import type`. Constante tipo enum = `as const` + `typeof` (sem `enum` TS).
- **`src/stores/useProjectStore.ts`**: único dono do estado de domínio (persistido + derivados + ações). Mudança no formato do estado é T4 (compatibilidade com o que já está salvo: passo novo na cadeia de migrações de `src/lib/migracaoEstado.ts`). O acesso ao IndexedDB fica em `src/stores/armazenamentoObras.ts`. `src/stores/ui.ts`: tema, navegação por hash, toasts.
- **`src/modules`**: uma tela por módulo; subcomponentes em `src/modules/<modulo>/`. **`src/components`**: layout, cards, Gantt, gráficos, ilustrações reutilizáveis.
- `<script setup lang="ts">`; componente com responsabilidade própria em arquivo próprio; estado de tela local com `ref`/`computed`. Componente não recalcula número de domínio: chama `src/lib` ou um derivado da store.
- Sem `any`, `@ts-ignore` ou `as unknown as` gratuitos. Imports pelo alias `@/`.

## Interface

- Textos em **português**; números e datas pelos formatadores de `src/lib/format.ts` (`fmtBRL`, `fmtBRLCents`, `fmtDate`, `fmtIndex`, `fmtPct`, `fmtDays`…) — nunca `toFixed` solto na tela.
- Tailwind com as classes utilitárias do `src/style.css` (`card`, `btn-*`, `chip-*`, `input`, `table-base`). Cores: zinc/slate, âmbar (destaque), esmeralda (ok), coral (crítico). Tema claro/escuro pela `ui` store.
- Ícones: `lucide-vue-next`.
- Gráficos (Chart.js via `vue-chartjs`): paleta validada para daltonismo (ver `components/charts/SCurveChart.vue`); legenda sempre presente com 2 ou mais séries; tabela alternativa ao gráfico.
- Erro ao usuário pelo toast da `ui` store, em português e sem detalhe técnico.
- Acessibilidade básica: botão com texto ou `aria-label`; cor nunca é a única pista (crítico também tem rótulo/ícone).

## Segurança (boas práticas OWASP)

- Nada de `v-html`/`innerHTML` com texto do usuário, do XML importado ou de IA (XSS — [OWASP A03](https://owasp.org/Top10/A03_2021-Injection/)).
- Arquivo do usuário: limite de tamanho e tipo **antes** de ler (XML 15 MB, CSV 2 MB, foto 8 MB — mantenha ou justifique).
- Toda `VITE_*` é **pública** (vai no bundle): nunca chave, token ou senha.
- Armazenamento do navegador (IndexedDB, `localStorage` do tema) sempre tolerante a falha, sem engolir erro de gravação em silêncio (a store avisa pela faixa de armazenamento); só estado da obra, nunca credencial. O que vai ao IndexedDB é string ou objeto simples: um proxy reativo do Vue causa `DataCloneError`.
- Relato de campo e saída da IA são dado: a EAP só muda por `approveReport` (aprovação explícita do engenheiro).

## Antes de entregar

```bash
npm run lint
npm run typecheck                        # vue-tsc --noEmit
npx vitest run <arquivos de teste>       # ou: node .claude/scripts/testar-afetado.mjs --base master
npm run dev                              # conferir a tela em http://localhost:5180 (V-N na matriz)
```
