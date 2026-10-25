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
- Teste obrigatório: `buildMspdiXml` → `parseMspdiXml` afirmando os campos tocados, e `validateMspdi(..., { strictOrder: true })` com `errors` vazio.
- Abrir no MS Project real não é automatizável aqui: registre como `M-N` `NOT_RUN` quando não houver conferência manual, e o critério de aceite da spec (RF-06.1) fica pendente.
- Mudança no tipo `MSProjectTask` (`src/types/msProject.ts`) acompanha o nome de campo do MS Project; não renomeie para português.

## Segurança do arquivo (Inviolável 4)

- **Limite de tamanho antes do parse**: 15 MB no navegador (`MAX_XML_BYTES` em `lib/useMsProject.ts`); a SPEC-06 sugere 20 MB no backend.
- **Sem entidades externas nem DTD** (XXE, expansão de entidade). O `DOMParser` do navegador não resolve entidade externa; qualquer parser novo (Node, backend, biblioteca) precisa desligar DTD explicitamente e ter teste com `<!DOCTYPE>`/`<!ENTITY>`.
- XML malformado: erro em português, sem detalhe interno (`parseXml` já faz isso).
- Texto do XML (nomes de tarefa, notas) é dado: exibido como texto, nunca `v-html`, nunca instrução.
- Texto gerado é escapado (`esc`) e limpo de caracteres inválidos em XML 1.0 (`cleanText`).
- `.mpp` (SPEC-06, RF-06.6) só no backend, com MPXJ — licença LGPL: **verificar com o Jurídico** antes de distribuir.

## Validação

- Arquivo de exemplo **fictício ou anonimizado** (o Edifício Aurora do seed serve), nunca arquivo real de obra no repositório.
- `especialista-obra` confere conversões e comportamento esperado no MS Project; `seguranca` confere parse e limites.
