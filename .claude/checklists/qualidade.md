# Checklist de qualidade — fonte única

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/checklists/qualidade.md`) para o CronoAI em 25/10/2026.

Usado por `agents/revisor.md` e `agents/arquiteto.md` (modo revisão). **Altere só aqui.** Achados aqui **bloqueiam** como os demais blocos.

**Simplicidade**
- Abstração, camada ou indireção sem valor observável? Nomeie o que poderia sair sem perda funcional.
- Função que resolve mais de um problema distinto (ex.: calcula e formata para a tela)?
- Condicional que uma estrutura já presente eliminaria (tabela `as const`, `switch` por `LinkType`, `SCHEMA_ORDER`)?

**Reuso**
- Cria algo que já existe? Aponte o equivalente: calendário e dias úteis (`lib/calendar.ts`: `WorkCalendar`, `addCalendarDays`, `countWorkingBetween`), formatação (`lib/format.ts`: `fmtBRL`, `fmtDate`, `fmtIndex`, `fmtDays`), EAP (`lib/wbs.ts`), conversões de unidade (`calendarioTrabalho.ts`: `diasParaMinutos`, `minutosParaDias`; MSPDI: `minutosParaDuracao`, `lagDeMspdi`, `lagParaMspdi`; exibição do lag: `lagEmDias` em `wbs.ts`), número pt-BR (`parseNumberBR`), componentes comuns (`components/common/`).
- Cálculo refeito dentro de componente ou da store em vez de chamar `src/lib`? Duas implementações do mesmo número divergem com o tempo.

**Convenções (`CLAUDE.md › Convenções`)** — aponte o item violado
- `src/lib` puro: sem store, DOM ou `localStorage` (exceções `download.ts`, `useMsProject.ts`).
- Datas ISO `yyyy-mm-dd` UTC; durações, lags e folgas em minutos inteiros (ADR 00003; conversão só em `calendarioTrabalho.ts`); dinheiro em `number`, arredondado só na exibição.
- Sem `any`, `@ts-ignore`, `as unknown as` gratuitos; sem `enum` TS (`as const` + `typeof`).
- `<script setup lang="ts">`; estado de domínio só na store; estado de tela com `ref`/`computed`; subcomponente de módulo em `src/modules/<modulo>/`.
- Textos de interface em português; números pelos formatadores; classes utilitárias do `style.css`; paleta e legenda dos gráficos (`SCurveChart.vue`).
- Comentários em português explicando o **porquê**; fórmula citada no comentário do cálculo.
- Premissa ilustrativa (SINAPI, RUP, taxa, lead time, fator de cenário) marcada como tal.
- O diff muda comportamento descrito no `CLAUDE.md`, numa spec, no `README.md` ou em `docs/devops.md`? O documento foi atualizado no mesmo diff?

**Números e testes**
- Cálculo novo/alterado sem teste que fixe o valor (Inviolável 1)?
- Asserção fraca para cálculo exato (`toBeGreaterThan`, `toBeTruthy`)?
- Teste existente com valor alterado sem o antes → depois justificado?
- Arredondamento no meio do cálculo (antes da exibição) ou `Math.round` que muda a unidade sem comentário?

**Legibilidade**
- Nome que não comunica a intenção de negócio (ES/EF/LS/LF, BAC, DLP são nomes de domínio aceitos)?
- Comentário que explica *o quê* em vez de *por quê*?
- Função com mais de ~30 linhas sem motivação clara (os passos de ida/volta do CPM são exceção conhecida)?

**Tratamento de erro e falha silenciosa**

Falha que não aparece vira número errado na obra. Procure:

- `catch` que engole a exceção (vazio, `return []`, valor padrão) sem avisar o usuário.
- **Fallback que mascara erro**: valor padrão quando a origem falhou, sem distinguir "não há dado" de "não consegui ler". Exemplos do CronoAI: import do XML que ignora vínculo ou campo sem aviso (Inviolável 2); taxa horária que cai no padrão (`rateOf` devolve 30) sem sinalizar; `safeDiv` (`lib/evm.ts`) que devolve 1 quando o divisor é zero e faz SPI/CPI = 1,00 parecer desempenho real.
- `NaN`/`Infinity` que chega à tela ou ao XML (divisão por zero, `Number('')`).
- Promise não aguardada, retorno não verificado.
- Erro no front que não informa o usuário (a tela simplesmente não atualiza) — use o toast da `ui` store.

Para cada achado, descreva o **cenário concreto**: que entrada ou estado provoca a falha e o que o usuário vê. Achado sem cenário é opinião.

**Não reprove por**: preferência de estilo não escrita no `CLAUDE.md`, ou `catch` deliberadamente silencioso com comentário explicando por quê (ex.: `loadState` que recomeça com os dados de exemplo quando o estado salvo está corrompido).
