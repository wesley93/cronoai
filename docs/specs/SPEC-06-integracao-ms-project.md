# SPEC-06 — Integração MS Project (`.xml` e `.mpp`)

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 1 (`.xml` validado no MS Project real), 3 (`.mpp` via backend) |
| Prioridade | Alta |
| Esforço | M (`.xml`) + M (`.mpp`) |
| Depende de | SPEC-05 (paridade), SPEC-01 (para `.mpp`) |
| Validar com | Planejamento (versões do MS Project em uso), Segurança (upload de arquivos) |

## 1. Problema
O MSPDI gerado ([msProjectXmlParser.ts](../../src/lib/msProjectXmlParser.ts)) passa no validador interno: bem-formação, UIDs, vínculos e ordem das sequências do [esquema MSPDI](https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference). Mas:
- nunca foi aberto num MS Project real;
- não é validado contra o XSD oficial;
- arquivos `.mpp` (o formato nativo) não são lidos;
- campos timephased, recursos com custo e múltiplas linhas de base são parciais.

## 2. Objetivo
Ida e volta sem perda entre CronoAI e MS Project, nas versões usadas pela empresa, e leitura direta de `.mpp`.

## 3. Requisitos funcionais
- **RF-06.1 Matriz de compatibilidade:** MS Project 2016, 2019, 2021 e Project para a Web/365 (confirmar quais a empresa usa). Para cada versão: abrir o `.xml` exportado, salvar e reimportar.
- **RF-06.2 Validação XSD:** validar o export contra o XSD oficial do MSPDI no CI (o XSD fica em `tests/fixtures/msproject/schema/`, com licença verificada).
- **RF-06.3** Preservar na ida e volta: UID, ID, WBS/OutlineNumber, nome, duração, vínculos (tipo e lag em qualquer formato), restrições, % concluído, início/término reais, custo fixo, custo real, linhas de base 0–10, calendários (com intervalos e exceções recorrentes), recursos, atribuições e campos personalizados (SINAPI em Text1, lead time em Number1).
- **RF-06.4 Mapeamento configurável** de campos personalizados (ex.: a empresa usa Text5 para o código SINAPI), feito na Central de integrações ([SPEC-15](SPEC-15-central-integracoes.md) RF-15.3; ciclo 00010 da Fase 1).
- **RF-06.5 Importação incremental:** reimportar um `.xml` atualizado no MS Project mescla as mudanças pelo UID e mostra um diff (tarefas novas, removidas, alteradas) antes de aplicar.
- **RF-06.6 `.mpp` (Fase 3):** upload de `.mpp` processado no backend com [MPXJ](https://www.mpxj.org/), devolvendo o mesmo modelo do MSPDI. Exportar `.mpp` não é possível com MPXJ (só leitura): manter `.xml` para a volta.
- **RF-06.7** Recursos com taxa padrão opcional: escolher entre custo no "custo fixo" (padrão atual, evita contagem dupla) ou custo por recurso.

## 4. Requisitos não funcionais
- **RNF-06.1** Upload limitado (ex.: 20 MB), com antivírus/verificação de tipo no backend; sem processar entidades externas no XML (proteção XXE).
- **RNF-06.2** Importar 3.000 tarefas em menos de 3 s.

## 4a. Corpus de referência disponível (out/2026)
134 arquivos MSPDI gerados pelo MS Project 2002, 2003, 2007, 2010, 2013, 2016 e 2019, dos dados de teste do MPXJ (LGPL-2.1, cópia local em `referencias/mpxj-mspdi/`, fora do git).
- **Uso imediato:** robustez da importação. Todos devem abrir sem erro e sem perder UID, vínculos, calendários e linhas de base.
- **Limite:** só 8 têm vínculos entre tarefas, então a paridade de datas do CPM (SPEC-05) continua exigindo cronogramas reais de obra anonimizados.
- **Testes:** leem o caminho por variável de ambiente (`CRONOAI_REF_DIR`) e são pulados sem ela, para o CI não depender dos arquivos.
- **XSD oficial:** só é distribuído dentro do instalador do Project SDK (`.exe`), que não é executado. A validação segue a referência publicada do esquema.

## 5. Critérios de aceite
- [ ] Os 5 cronogramas de referência (SPEC-05) fazem ida e volta CronoAI → MS Project → CronoAI sem diferença em RF-06.3.
- [ ] O CI falha se o export deixar de validar no XSD.
- [ ] Um `.mpp` real é importado com as mesmas datas do `.xml` equivalente.
- [ ] A reimportação incremental mostra o diff e só aplica após confirmação.

## 6. Riscos
- Diferença de comportamento entre versões do MS Project → a matriz RF-06.1 roda a cada release.
- Licença do MPXJ (LGPL) → **verificar licenciamento com o Jurídico** antes de distribuir.
