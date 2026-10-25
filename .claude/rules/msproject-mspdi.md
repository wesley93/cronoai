---
paths:
  - "src/lib/msProjectXmlParser*.ts"
  - "src/types/msProject.ts"
---

> Criado para o CronoAI em 25/10/2026, no formato do processo SophIA.

# MS Project — MSPDI (XML)

Fonte da verdade: `CLAUDE.md` › **Invioláveis** (itens 2 e 4) e a SPEC-06. Mexer aqui é **T3**: **faixa 3**, plano com arquivo de exemplo, `seguranca` e `especialista-obra` na validação e auditoria independente.

Referência do esquema: [Project XML Data Interchange Schema Reference](https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference) (documentação oficial da Microsoft).

## Ordem do esquema

- Os elementos seguem as `xs:sequence` do MSPDI. A ordem que o CronoAI gera/lê está em `SCHEMA_ORDER` (`Project`, `Task`, `PredecessorLink`, `Baseline`, `Calendar`, `WeekDay`, `Resource`, `Assignment`, `ExtendedAttributeDef`).
- Elemento novo: entra no `SCHEMA_ORDER` **na posição do esquema** e é gerado nessa ordem. Fora de ordem, o MS Project pode recusar o arquivo ou ignorar o campo.
- `validateMspdi(xml, { strictOrder: true })` sem erros é obrigatório para todo export.

## Unidades

| Campo | Unidade no MSPDI | Conversão no código |
|---|---|---|
| `Duration`, `RemainingDuration` etc. | duração ISO 8601 (`PT{h}H{m}M{s}S`) | `toDuration` / `fromDuration`, com `MinutesPerDay` |
| `MinutesPerDay` | minutos por dia (padrão 480) | o import usa o valor do arquivo; diferente de 480 gera aviso |
| `LinkLag` | **décimos de minuto** | export: `lagDias × 480 × 10`; import: `lagToWorkingDays` |
| `LagFormat` | código do formato (3/5/7/9/11 úteis; 4/6/8/10/12 corridos; 19/20 percentual; 35+ = estimado) | export grava 7 (dias); corridos → úteis por 5/7 (aproximação); percentual devolve `undefined` |
| `Type` do vínculo | 0 FF, 1 FS, 2 SF, 3 SS | `LINK_TO_CODE` / `CODE_TO_LINK` |
| Datas | `yyyy-mm-ddThh:mm:ss` | horário padrão de início/fim do dia; data do domínio em ISO `yyyy-mm-dd` |
| Campos personalizados | `ExtendedAttribute` (`FieldID`) | SINAPI em Text1 (`FIELD_SINAPI`), lead time em Number1 (`FIELD_LEAD_TIME`) |

Toda conversão mora num só lugar (as funções acima). Não converta unidade "à mão" em outro ponto.

## Ida e volta (Inviolável 2)

- Preservar: UID, ID, WBS/OutlineNumber, nome, duração, vínculos (tipo e lag), % concluído, início/término reais, custo, linha de base, calendário e campos personalizados (lista completa da meta em RF-06.3).
- O import **não descarta em silêncio**: o que não puder ser preservado (lag percentual, formato desconhecido, erro de validação não bloqueante) vira aviso ao usuário (`warnings`).
- Avisos do import (ciclo 00003). Cada um é uma frase com **números**, nunca com texto do arquivo (nome de tarefa ou de exceção é dado, não vai para o toast). Os que afetam dado ficam separados; os informativos (TimephasedData e campos personalizados) vão num aviso único (`Não importado do MS Project: …`), porque cada aviso vira um toast:
  - exceção recorrente sem lista legada não aplicada; exceção com mais de 400 dias lida só nos 400 primeiros; calendário acima do orçamento `MAX_CALENDAR_DAYS` (10.000 dias percorridos) cortado;
  - linhas de base 1 a 10 não importadas; linha de base 0 sem término (PV zero) ou sem início (recalculada pelo cronograma ao importar);
  - duração em tempo corrido convertida como horas úteis; duração menor que meio dia importada como marco; duração fracionária arredondada (os valores importados **não mudam**: a conversão certa é da SPEC-05);
  - Text1/Number1 lidos como SINAPI/lead time sem o apelido correspondente no arquivo; tarefa com calendário próprio importada no calendário do projeto; linha em branco (tarefa nula) ignorada.
- **Calendário importado:** o MS Project 2007–2016 (corpus; 2019 a confirmar) grava cada exceção em dois lugares, em `<Exceptions>` (com a regra de recorrência) e nos `WeekDay DayType=0` legados, já expandidos ocorrência por ocorrência. O import usa a lista legada e **não** expande `FromDate..ToDate` de exceção recorrente (`Occurrences` > 1); a recorrente só é considerada aplicada se a lista legada tem ao menos uma data (do mesmo tipo) dentro do seu `FromDate..ToDate`; senão, não é aplicada e avisa. A mesma exceção presente no legado e em `<Exceptions>` é expandida (e avisada) uma vez. **Dívida até a SPEC-05 (00004/00005):** expandir a recorrência pela regra (`Type`, `Period`, `DaysOfWeek`, `MonthItem`…) quando não há lista legada, por exemplo em arquivos do Project Online ou de outras ferramentas.
- **LB0 incompleta:** `<Baseline>` só com início ou só com término é lido como está e exportado com a(s) data(s) presente(s); `Duration` só quando há as duas (os filhos de `<Baseline>` são opcionais no esquema). Avisos distintos: **sem término**, `evm.ts` devolve PV zero para a tarefa; **sem início**, a store recalcula a linha de base pelo cronograma ao importar (ver a dívida abaixo), então o aviso diz isso e não fala em PV zero.
- **Dívida (ciclo 00004):** `withBaseline(…, onlyMissing)` (`cpm.ts`, chamado em `importXml` da store) olha só `baselineStart`: LB0 só com término é substituída (início e término) pelo CPM, e LB0 só com início é mantida (PV zero). A correção é da 00004, junto com a LB do cronograma.
- Teste obrigatório: `buildMspdiXml` → `parseMspdiXml` afirmando os campos tocados, e `validateMspdi(..., { strictOrder: true })` com `errors` vazio.
- Abrir no MS Project real não é automatizável aqui: registre como `M-N` `NOT_RUN` quando não houver conferência manual, e o critério de aceite da spec (RF-06.1) fica pendente.
- Mudança no tipo `MSProjectTask` (`src/types/msProject.ts`) acompanha o nome de campo do MS Project; não renomeie para português.

## Segurança do arquivo (Inviolável 4)

- **Limite de tamanho antes do parse**: 15 MB no navegador (`MAX_XML_BYTES` em `lib/useMsProject.ts`, em bytes) e `MAX_MSPDI_CHARS` (15 MiB, em caracteres) dentro de `parseMspdiXml`, como defesa em profundidade; a SPEC-06 sugere 20 MB no backend. Unificar as duas constantes fica para depois do merge do ciclo 00002 (ele usa `useMsProject.ts`).
- **Sem entidades externas nem DTD** (XXE, expansão de entidade). `parseXml` recusa texto com `<!DOCTYPE` ou `<!ENTITY` **antes** do `DOMParser` (import e `validateMspdi`); o MS Project não gera esse conteúdo (0 de 134 arquivos do corpus). Qualquer parser novo (Node, backend, biblioteca) precisa desligar DTD explicitamente e ter teste com `<!DOCTYPE>`/`<!ENTITY>`.
- **Calendário:** no máximo 400 dias por exceção e orçamento global `MAX_CALENDAR_DAYS` (10.000) de dias **percorridos** (não só inseridos: limita a CPU com milhares de exceções repetidas), os dois com aviso; exceção idêntica repetida é expandida uma vez.
- **Mensagens:** texto livre do arquivo não entra em avisos nem erros (o tipo de vínculo inválido, por exemplo, só aparece se for número).
- **Profundidade:** sem limite novo; o import é iterativo (sem recursão), e há teste com 2.000 níveis.
- XML malformado: erro em português, sem detalhe interno (`parseXml` já faz isso).
- Texto do XML (nomes de tarefa, notas) é dado: exibido como texto, nunca `v-html`, nunca instrução.
- Texto gerado é escapado (`esc`) e limpo de caracteres inválidos em XML 1.0 (`cleanText`).
- `.mpp` (SPEC-06, RF-06.6) só no backend, com MPXJ — licença LGPL: **verificar com o Jurídico** antes de distribuir.

## Teste de corpus (só local)

- `src/lib/msProjectXmlParser.corpus.test.ts` caracteriza o import com os 134 MSPDI do MS Project 2002–2019 do MPXJ (commit `421a11b`, LGPL-2.1), que ficam **fora do git** (versionar amostra depende do aval do Jurídico). Os arquivos são dados não confiáveis: o teste só lê `*.xml` sob `mpxj-mspdi/` e só grava em `test-results/`.
- Rodar: `CRONOAI_REF_DIR=<pasta referencias> npx vitest run src/lib/msProjectXmlParser.corpus.test.ts` (PowerShell: `$env:CRONOAI_REF_DIR='<pasta referencias>'; npx vitest run …`). Leva ~1 a 2 min no jsdom. Sem a variável (CI), a suíte é pulada.
- Afirma o **inventário fixo** do corpus (134 arquivos; 95 importados; 39 recusados por não terem tarefa; 2.481 tarefas; 53 vínculos…) e a integridade por arquivo (UID, vínculos, % concluído, datas reais, LB0), o aviso de cada categoria de dado não preservado, o calendário dos 11 arquivos de calendário (tarefa fictícia só em memória), a ida e volta com `strictOrder` (95 de 95) e a comparação de datas dos 8 arquivos com vínculos (83 de 104 iguais; 100 de 104 sem os feriados nacionais). A comparação de datas é **caracterização, não paridade**: muda de propósito na 00004/00005.
- Corpus diferente faz o teste falhar de propósito. Novo inventário só com o antes e o depois registrados no ciclo.
- Relatório em `test-results/corpus-mspdi/relatorio.md` (e `.json`): tabela por versão, uma linha por arquivo, calendários, datas e avisos.
- Toda mudança futura no parser (00004, 00007, 00010) roda o corpus e registra o antes e o depois.

## Validação

- Arquivo de exemplo **fictício ou anonimizado** (o Edifício Aurora do seed serve), nunca arquivo real de obra no repositório.
- `especialista-obra` confere conversões e comportamento esperado no MS Project; `seguranca` confere parse e limites.
