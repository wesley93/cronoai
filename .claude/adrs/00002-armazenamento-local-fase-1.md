# 00002 - Armazenamento local da Fase 1: IndexedDB, uma entrada por obra

**Data**: 2026-10-25
**Status**: Aceito pelo orquestrador em 25/10/2026 (P1 = A no gate do ciclo 00002, com autorização do usuário para seguir sem parar), sujeito à revisão do usuário no PR
**Spec/decisão relacionada**: SPEC-14 RF-14.2, RNF-14.2; SPEC-15 RNF-15.3; `docs/specs/PLANO-FASE-1.md` §3.2 ("ADR do armazenamento local para a fase toda"), §3.6 e §3.7; ficha `.claude/ciclos/00002-multiobra-ficha.md`

## Contexto
O protótipo guarda **uma** obra numa chave do `localStorage` (`cronoai-state-v1`, `src/stores/useProjectStore.ts:50`). A gravação engole o erro de cota (`:147-151`). A Fase 1 grava, por obra, premissas (00005), recorte SINAPI (00006), snapshots semanais (00007) e mapeamento de campos (00010). A SPEC-14 RNF-14.1 fala em até 50 obras de 3.000 tarefas.

Volume estimado (caracteres de JSON; o `localStorage` conta a chave e o valor):

| Item | Base | Estimativa |
|---|---|---|
| Obra de exemplo hoje | **Medido:** 17.459 caracteres, 29 tarefas | — |
| Tarefas de uma obra de 3.000 tarefas | **Medido:** 477,6 caracteres por tarefa (obra sintética derivada do seed, 25/10/2026) | **1,43 milhão** |
| Mesmas tarefas depois do motor em minutos (00004) | Estimativa: +10% a 20% (calendário, restrição, formato do lag) | 1,6 a 1,7 milhão |
| Relatos de campo (texto) | Estimativa: ~250 caracteres por relato | 1.000 relatos: ~0,25 milhão |
| Fotos dos relatos | Data URL JPEG de 360 px (`ReportComposer.vue:31-42`). Estimativa: ~35 mil caracteres por foto | 50 fotos: ~1,75 milhão |
| Materiais, orçamento (até 200 linhas), log | Estimativa | 0,1 a 0,3 milhão |
| **Uma obra grande, em uso** | Soma | **2 a 4 milhões** |
| Recorte SINAPI (00006), compartilhado por UF/regime/data-base | **Medido em 25/10/2026** (SP, não desonerado, 09/2026): ~410 caracteres por composição (a estimativa anterior, ~250, ficou baixa) | Filtrado (500 composições): ~0,2 milhão. UF inteira (8.443 composições com custo): **~3,46 milhões** de caracteres compactos (~3,5 MB); limite do arquivo importado: 6 MiB |
| Snapshots (00007) | Estimativa: ~120 caracteres por tarefa num snapshot compacto | 104 × 3.000 × 120: **~37 milhões por obra** |
| Premissas versionadas (00005), mapeamento (00010) | Estimativa | < 0,05 milhão |

Cenários da Fase 1:
- **5 obras grandes, 2 recortes de UF inteira, snapshots em 1 obra:** ~15 + ~6,9 + ~37 = **~59 milhões de caracteres** (com o recorte medido no 00006: 2 × 3,46).
- **RNF-14.1 (50 obras de 3.000 tarefas), só as tarefas:** ~80 a 85 milhões.

Limites (prática documentada, [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria); confirmar no navegador usado pela empresa):
- `localStorage`: até ~5 MiB por origem. Na melhor hipótese, ~5 milhões de caracteres: **1 ou 2 obras grandes e nenhum snapshot**.
- IndexedDB: cota do armazenamento da origem, proporcional ao disco (no Chrome, até uma fração grande do disco; no Firefox, o menor entre 10% do disco e 10 GiB por grupo). Comporta o cenário da Fase 1 em máquinas comuns.
- Os dois são "best-effort": o navegador pode apagar dados de uma origem sob falta de disco. `navigator.storage.persist()` pede proteção.

## Decisão
A Fase 1 guarda as obras no **IndexedDB**, a partir do ciclo 00002: banco `cronoai`, **uma entrada por obra** (string JSON do estado, com `versaoEsquema`) e um **índice** (obra ativa e resumos), gravados na mesma transação, com uma cadeia de migrações versionada em `src/lib`. A chave `cronoai-state-v1` só é lida, para a migração.

## Justificativa
- **Volume (exigência dos números acima):** o `localStorage` não comporta nem os snapshots de uma obra (00007). Ficar nele obrigaria a migrar o armazenamento de novo no 00007, com histórico imutável no meio. O PLANO §3.2 já previa "IndexedDB já aqui, para não migrar o armazenamento duas vezes".
- **Isolamento por obra (opinião):** uma obra ilegível ou grande não derruba as outras. A transação do IndexedDB mantém índice e obra coerentes; dois `setItem` no `localStorage` não são atômicos.
- **Formato preservado:** a obra é gravada como a mesma string JSON de hoje. A migração da v1 é um "embrulho", provado por `toEqual` contra o JSON salvo.
- **Sem dependência nova:** a API nativa basta para ler, gravar e excluir por chave. Um pacote como `idb` (ISC) ou `fake-indexeddb` (Apache-2.0) seria T5, com revisão de segurança e de licença antes do uso.
- **Testável:** a store usa uma interface com dois adaptadores (IndexedDB e memória). O jsdom não tem IndexedDB: os testes unitários usam o de memória, e o E2E (Chromium) cobre o adaptador real.
- **Versões separadas:** a versão de **estrutura** do banco (stores do IndexedDB, `onupgradeneeded`) é diferente da versão de **esquema** da obra (`versaoEsquema`, cadeia em `src/lib/migracaoEstado.ts`). Obra com esquema maior que o do app é tratada como ilegível e nunca é sobrescrita.

## Estrutura
| Store | Chave | Valor | Ciclo |
|---|---|---|---|
| `meta` | `'indice'` | `{ versaoIndice: 1, obraAtivaId, obras: ResumoObra[], migracaoV1? }` | 00002 |
| `obras` | `id` (keyPath) | `{ id, versaoEsquema, json, atualizadoEm }` | 00002 |
| `recortesSinapi` | `chave` = `uf\|regime\|dataBase` (keyPath) | `{ chave, versaoFormato, json, sha256Origem, importadoEm, composicoes }` (recorte JSON compacto + metadados da fonte) | 00006 (estrutura 2, implementada) |
| `snapshots` | `[obraId, dataStatus]` | snapshot imutável | 00007 (estrutura 3) |

Cada ciclo que acrescenta store sobe a versão de estrutura; cada ciclo que muda o formato da obra acrescenta um passo à cadeia de esquema e o teste com o formato anterior.

## Alternativas descartadas
| Alternativa | Motivo |
|---|---|
| `localStorage` com chave por obra + índice | Mais simples e síncrono. Cabe 1 ou 2 obras grandes e nenhum histórico; o 00007 forçaria uma segunda migração |
| `localStorage` agora, atrás de interface assíncrona; IndexedDB no 00007 | Código assíncrono uma vez, mas dados migrados duas vezes, a 2ª com snapshots |
| Misto: obras no `localStorage`, histórico e recortes no IndexedDB | Dois armazenamentos sem transação comum: índice, obra e snapshot podem divergir |
| Um documento único com todas as obras | Uma obra corrompida ou grande derruba todas; cada gravação reescreve tudo |
| OPFS (Origin Private File System) | Útil para arquivos grandes; para registros por chave, o IndexedDB é mais direto. Pode ser reavaliado para fotos |
| Pacotes `idb` / `fake-indexeddb` | Dependência nova (T5) sem ganho que justifique |

## Consequências
**Positivas**
- Cabe a Fase 1 inteira, inclusive snapshots e recortes.
- Uma obra com problema não afeta as outras; índice e obra mudam juntos.
- Os ciclos 00004 a 00010 só acrescentam passos à cadeia (SPEC-15 RNF-15.3).
- Falha de gravação passa a ser visível (RNF-14.2).

**Negativas / trade-offs**
- Partida assíncrona: o app monta só depois de carregar a obra ativa.
- O adaptador IndexedDB depende do E2E para teste (sem teste unitário no jsdom).
- Duas abas na mesma obra: a última gravação vence (igual a hoje).
- A chave `cronoai-state-v1` fica no navegador, congelada, como cópia de segurança para rollback. Apagá-la é decisão de um ciclo futuro.
- Continua "best-effort": o navegador pode apagar os dados sob falta de disco até a SPEC-01. O pedido de armazenamento persistente fica para o 00007.

**Efeito nos números** — nenhum. O formato MSPDI não muda.

## Validações com outras áreas
- **Infraestrutura:** nenhuma neste ciclo (armazenamento no navegador do usuário). A persistência definitiva é a SPEC-01 (backend .NET 10 + PostgreSQL, ADR 00001), com a Infraestrutura.
- **Jurídico:** dados de várias obras e empresas no mesmo navegador (termos de uso, LGPD), antes de abrir para clientes. Pendência já registrada no PLANO §3.2.

## Revisão
Revisar se: a SPEC-01 entrar (o servidor vira o dono dos dados e o navegador passa a cache); a medição real de uma obra grande passar de 10 milhões de caracteres; ou o navegador-alvo da empresa limitar o IndexedDB abaixo de ~200 MB.
