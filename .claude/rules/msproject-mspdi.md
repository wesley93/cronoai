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
| `Duration`, `RemainingDuration` etc. | duração ISO 8601 (`PT{h}H{m}M{s}S`) | import: minutos exatos (`durationMinutes`, segundos arredondados para o minuto com aviso; negativa, acima de 50 anos ou ilegível entra como 0 com aviso); export: `minutosParaDuracao`. `DurationFormat` corrido (4/6/8/10/12 e estimados 36…44) vira `duracaoCorrida` e volta como 8 |
| `MinutesPerDay` | minutos por dia (padrão 480) | `meta.minutosPorDia` (só para exibir dias e para o `D` da duração ISO); inteiro de 1 a 1.440, fora disso vale 480 com aviso; volta no export com `MinutesPerWeek` = 5 × |
| `LinkLag` | **décimos de minuto**; nos formatos de % (19/20/51/52), o **percentual inteiro** (50 = 50%) | `lagDeMspdi` (import) e `lagParaMspdi` (export): minutos exatos, sem 5/7 |
| `LagFormat` | 3/5/7/9/11 úteis (min, h, d, sem, mês); 4/6/8/10/12 corridos; 19/20 percentual (20 calculado como %, com aviso); 35+ = estimados (código − 32); 21/53 nulos | o código original fica em `lag.codigoMspdi` e volta no export; sem código: 7 (útil), 8 (corrido), 19 (%) |
| `ConstraintType` / `ConstraintDate` / `Deadline` | 0 ASAP, 1 ALAP, 2 MSO, 3 MFO, 4 SNET, 5 SNLT, 6 FNET, 7 FNLT; data e hora sem fuso | `Task.restricao` (`yyyy-mm-ddThh:mm`) e `Task.prazoFinal`; a restrição **inferida** pelo import (tarefa sem vínculo e sem avanço recebe SNET = início do arquivo) é marcada `inferida` e volta como `ConstraintType` 0 |
| `CalendarUID` | calendário-base da tarefa | `Task.calendarioUid` (só quando é um calendário importado diferente do padrão) |
| `HonorConstraints`, `SplitsInProgressTasks`, `Move*` | cabeçalho | `honorConstraintsArquivo` só para a volta (o cálculo sempre honra as restrições; obra sem valor de arquivo grava 0); `SplitsInProgressTasks` ↔ lógica retida/substituir; as 4 `Move*` são preservadas sem entrar no cálculo |
| `Active`, `Manual` | marcas da tarefa (2010+) | `Task.arquivo.ativa`/`manual`, devolvidas só quando o arquivo as trouxe (entram no `SCHEMA_ORDER.Task` depois de `Name`). Tarefa **manual não alterada** no CronoAI (duração, % e restrição iguais às do arquivo, `alteradaDepoisDaImportacao`) volta com `Start`/`Finish` do arquivo (08:00 e 17:00); alterada, com as datas calculadas, e a exportação avisa quantas foram (`tarefasManuaisAlteradas`) |
| `Type` do vínculo | 0 FF, 1 FS, 2 SF, 3 SS | `LINK_TO_CODE` / `CODE_TO_LINK` |
| Datas | `yyyy-mm-ddThh:mm:ss` | horário padrão de início/fim do dia; data do domínio em ISO `yyyy-mm-dd` |
| Campos personalizados | `ExtendedAttribute` (`FieldID`) | SINAPI em Text1 (`FIELD_SINAPI`), lead time em Number1 (`FIELD_LEAD_TIME`) |

Toda conversão mora num só lugar (as funções acima). Não converta unidade "à mão" em outro ponto.

## Ida e volta (Inviolável 2)

- Preservar: UID, WBS/OutlineNumber, nome, duração em minutos (e a duração corrida), vínculos (tipo, lag exato e `LagFormat` original), % concluído, início/término reais, custo, linha de base, **calendários-base usados** (UID, nome, semana com horários, exceções com horário), `CalendarUID` da tarefa, restrição e prazo final, `Manual`/`Active`, jornada, `HonorConstraints`, lógica de progresso e `Move*`, e campos personalizados (lista completa da meta em RF-06.3). O **ID** do MS Project não é lido no import e o export o renumera (1..n pela ordem da EAP): é só posição de exibição, e o UID é a identidade preservada (no corpus, 1 de 95 arquivos tem ID fora dessa sequência). `Start`/`Finish`/`Early*`/`Late*` saem do cálculo do CronoAI, com as horas e as folgas exatas.
- O import **não descarta em silêncio**: o que não puder ser preservado (formato de lag desconhecido ou fora da faixa, restrição sem data ou com data inválida, calendário rejeitado, erro de validação não bloqueante) vira aviso ao usuário (`warnings`).
- Avisos do import (ciclo 00003). Cada um é uma frase com **números**, nunca com texto do arquivo (nome de tarefa ou de exceção é dado, não vai para o toast). Os que afetam dado ficam separados; os informativos (TimephasedData e campos personalizados) vão num aviso único (`Não importado do MS Project: …`), porque cada aviso vira um toast:
  - exceção recorrente não aplicada (sem lista legada, ou com menos de `Occurrences` datas legadas distintas do mesmo tipo no período); exceção com mais de 400 dias lida só nos 400 primeiros; calendário acima do orçamento `MAX_CALENDAR_DAYS` (10.000 dias percorridos) cortado; exceção com data inválida ou inexistente ignorada (contada uma vez, mesmo presente no legado e em `<Exceptions>`);
  - linhas de base 1 a 10 não importadas; linha de base 0 sem término ou sem início (o término do arquivo é mantido e o PV da tarefa fica zero), **só para tarefas folha** (resumo não conta);
  - **ciclo 00004 (E3):** a semana, os horários, o calendário por tarefa, a duração (inclusive em tempo corrido ou com fração) e o lag em qualquer formato agora são lidos e preservados: os avisos antigos de "semana diferente de segunda a sexta", "lag em formato diferente de dias úteis", duração em tempo corrido, menos de meio dia, fracionária e "calendário próprio" **deixaram de existir**. Novos: segundos arredondados para o minuto, calendário rejeitado ou acima do limite, tarefa com calendário não importado, `WorkWeeks` não aplicadas, lag em % decorrido (calculado como %), lag fora da faixa ou de formato desconhecido (importado com lag zero), restrição ou prazo com tipo desconhecido, sem data ou data inválida, datas a mais de 45 anos do início, e tarefas agendadas manualmente (calculadas automaticamente, marca preservada);
  - Text1/Number1 lidos como SINAPI/lead time sem o apelido correspondente no arquivo; linha em branco (tarefa nula) ignorada; no aviso único "Não importado do MS Project": calendários de recurso ou sem uso nas tarefas.
- **Calendário importado (ciclo 00004):** só os calendários-base (`IsBaseCalendar` 1) usados pelo projeto ou por alguma tarefa, até 100; semana `WeekDay` 1–7 com até 5 `WorkingTime` por dia (`ToTime` 00:00 vale 24:00; `00:00–00:00` é o dia inteiro); calendário sem tempo útil, com horário inválido (fim antes do início, `25:00`, sobreposição) ou mais de 5 intervalos é **rejeitado com aviso** (a tarefa usa o do projeto). O calendário do projeto sem feriados recebe os nacionais, com aviso, e a marca `feriadosNacionaisAplicados` explica a divergência de datas no painel. As regras de exceção abaixo valem para cada calendário. O MS Project 2007–2016 (corpus; 2019 a confirmar) grava cada exceção em dois lugares, em `<Exceptions>` (com a regra de recorrência) e nos `WeekDay DayType=0` legados, já expandidos ocorrência por ocorrência. O import usa a lista legada e **não** expande `FromDate..ToDate` de exceção recorrente (`Occurrences` > 1); a recorrente só é considerada aplicada se a lista legada tem ao menos `Occurrences` datas legadas distintas do mesmo tipo (feriado ou dia útil extra) dentro do seu `FromDate..ToDate`; senão, não é aplicada e avisa. A mesma exceção presente no legado e em `<Exceptions>` é expandida (e avisada) uma vez. **Dívida até a SPEC-05 (00004/00005):** expandir a recorrência pela regra (`Type`, `Period`, `DaysOfWeek`, `MonthItem`…) quando não há lista legada, por exemplo em arquivos do Project Online ou de outras ferramentas.
- **LB0 incompleta:** `<Baseline>` só com início ou só com término é lido como está, mantido (`withBaseline(…, onlyMissing)` pula a tarefa com `baselineStart` **ou** `baselineFinish`) e exportado com a(s) data(s) presente(s); `Duration` só quando há as duas (os filhos de `<Baseline>` são opcionais no esquema). Nos dois casos `evm.ts` devolve PV zero para a tarefa e o aviso diz isso.
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
- Rodar: `CRONOAI_REF_DIR=<pasta referencias> npx vitest run src/lib/msProjectXmlParser.corpus.test.ts` (PowerShell: `$env:CRONOAI_REF_DIR='<pasta referencias>'; npx vitest run …`). Leva ~1 a 4 min, conforme a carga da máquina (jsdom). Sem a variável (CI), a suíte é pulada.
- Afirma o **inventário fixo** do corpus (134 arquivos; 95 importados; 39 recusados por não terem tarefa; 2.481 tarefas; 53 vínculos…) e a integridade por arquivo (UID, vínculos, % concluído, datas reais, LB0), o aviso de cada categoria de dado não preservado, o calendário dos 11 arquivos de calendário (tarefa fictícia só em memória), a ida e volta com `strictOrder` (95 de 95) e a comparação de datas dos 8 arquivos com vínculos (83 de 104 iguais; 100 de 104 sem os feriados nacionais). A comparação de datas é **caracterização, não paridade**: muda de propósito na 00004/00005.
- Corpus diferente faz o teste falhar de propósito. Novo inventário só com o antes e o depois registrados no ciclo.
- Relatório em `test-results/corpus-mspdi/relatorio.md` (e `.json`): tabela por versão, uma linha por arquivo, calendários, datas e avisos.
- Toda mudança futura no parser (00007, 00010) roda o corpus e registra o antes e o depois. No ciclo 00004 (E3) o inventário de avisos mudou: tempo corrido 5 → 0, menos de meio dia 4 → 0, fracionária 20 → 0, calendário próprio 1 → 0, lag em formato diferente 12 → 0 e "Projeto com 7,5 h/dia" 2 → 0; novos: 1.136 tarefas manuais em 38 arquivos e 3 valores com segundos arredondados. A ida e volta continua 95 de 95 (agora com calendários, restrições, lag e `Manual`) e a comparação de datas, 83 de 104 e 100 de 104.

## Validação

- Arquivo de exemplo **fictício ou anonimizado** (o Edifício Aurora do seed serve), nunca arquivo real de obra no repositório.
- `especialista-obra` confere conversões e comportamento esperado no MS Project; `seguranca` confere parse e limites.
