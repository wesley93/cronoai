# SPEC-01 — Arquitetura alvo, backend, banco e multi-obra

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 2 |
| Prioridade | Alta |
| Esforço | G (grande) |
| Depende de | SPEC-00, SPEC-03, SPEC-04 (modelos validados no front) |
| Validar com | Infraestrutura (hospedagem, banco gerenciado, backup), Segurança |

## 1. Problema
Todo o estado vive no `localStorage` de um navegador ([useProjectStore.ts](../../src/stores/useProjectStore.ts)). Por isso:
- o encarregado e o engenheiro não veem o mesmo dado;
- limpar o navegador apaga a obra;
- não há backup;
- não dá para ter mais de uma obra.

## 2. Objetivo
Um backend único, dono dos dados, com várias obras por empresa. O front passa a consumir uma API, e o cálculo de cronograma e EVM roda no servidor, que é a fonte da verdade.

## 3. Arquitetura (recomendação)

```text
[Vue 3 SPA] ──HTTPS/JSON──> [API .NET 10]
                             ├─ Domínio: Cronograma (CPM), EVM, Suprimentos, SINAPI
                             ├─ MPXJ.Net (.mpp/.xml) ── SPEC-06
                             ├─ Jobs (Hangfire/Quartz): fechamento semanal, importações, notificações
                             └─ Integrações: WhatsApp, IA, ERP (SPEC-08/09) via filas
        PostgreSQL 17 (Fase 2; +pgvector p/ busca semântica da EAP, Redis e jobs na Fase 3)   Armazenamento de arquivos (fotos/áudios/XML)
```

Fase 2 (ciclo 00011): solução em `server/` com `Api → Dados → Dominio`, schema `cronoai`, papéis `cronoai_migrador` (migrações) e `cronoai_app` (só DML) e PostgreSQL 17 local. Convenções no [ADR 00004](../../.claude/adrs/00004-estrutura-convencoes-backend.md). Redis, jobs e pgvector entram na Fase 3.

- **D1 decidida:** .NET 10 (LTS) + PostgreSQL, conforme o [ADR 00001](../../.claude/adrs/00001-stack-backend-dotnet-10.md). Hospedagem e banco gerenciado continuam pendentes com a Infraestrutura.
- O motor CPM/EVM atual (TypeScript) vira a **especificação executável**: os mesmos casos de teste ([src/lib/*.test.ts](../../src/lib)) são portados e precisam passar no backend com resultados idênticos.

## 4. Requisitos funcionais
- **RF-01.1** Cadastro de **empresa → obras → usuários**; cada obra tem EAP, calendário, premissas, insumos, relatos e snapshots próprios.
- **RF-01.1a Multiempresa (SaaS):** várias construtoras/gestoras usam o mesmo sistema com **isolamento total** de dados entre empresas. Um engenheiro autônomo é uma empresa de um usuário só. Um usuário pode pertencer a mais de uma empresa e escolhe a empresa ativa ao entrar.
- **RF-01.1b Obra em qualquer UF:** toda obra tem UF e município (código IBGE). Eles definem os feriados (SPEC-03), a tabela SINAPI e o regime de encargos (SPEC-07). Nenhuma regra assume um estado fixo.
- **RF-01.1c Frentes:** a obra pode ter frentes/subempreitadas com responsável próprio (agrupamento da EAP), usadas em permissões (SPEC-02) e no portfólio (SPEC-14).
- **RF-01.2** API REST versionada (`/api/v1`), com contratos em OpenAPI publicados no repositório.
- **RF-01.3** Recursos mínimos:
  - `GET/PUT /obras/{id}/tarefas`
  - `POST /obras/{id}/apontamentos/{id}/aprovar`
  - `POST /obras/{id}/cenarios/simular|aplicar`
  - `GET /obras/{id}/evm?data=`
  - `GET /obras/{id}/curva-s?pacote=`
  - `POST /obras/{id}/import/msproject`
  - `GET /obras/{id}/export/msproject`
  - `POST /obras/{id}/snapshots`
  - `CRUD /obras/{id}/insumos`
  - `POST /obras/{id}/orcamento/gerar`
- **RF-01.4** **Concorrência otimista:** toda escrita envia a versão (`ETag`/`rowversion`). Edição simultânea conflitante retorna 409 com o estado atual.
- **RF-01.5** **Migração do protótipo:** importar o JSON do `localStorage` (botão "Exportar dados locais" no front) para uma obra no servidor.
- **RF-01.6** Front em modo *offline-first* opcional para o canteiro (fila local de apontamentos sincronizada depois). **(recomendação)**

## 5. Modelo de dados (núcleo)

| Tabela | Campos principais |
|---|---|
| `empresa` | id, nome (sem `cnpj` por ora: minimização de dados; decisão do ciclo 00012, ADR 00006 — volta com o Jurídico se um ciclo precisar) |
| `obra` | **Ciclo 00013 (criada):** id, empresa_id, nome (único entre as não arquivadas), uf, municipio_ibge (7 dígitos, com dígito verificador), responsavel_id (membro da mesma empresa), data_status (nula permitida), sinapi_uf, sinapi_regime, sinapi_data_base (fonte única dos campos SINAPI: o 00015 não os duplica nas premissas), opcoes_cronograma (jsonb opaco, até 16 KB), versao (bigint, por gatilho), criada_em, atualizada_em, arquivada_em. **Ciclo 00015 (ainda não existem):** data_inicio, calendario_id, premissas (jsonb versionado) |
| `uf_referencia` / `municipio_referencia` | **Ciclo 00013:** listas nacionais globais, sem RLS. UF: sigla, codigo_ibge, nome (27 linhas semeadas pela migração). Município: codigo_ibge, uf, nome (vazia até a carga oficial; sem FK da obra até lá) |
| `tarefa` | id, obra_id, uid_msproject, wbs, nome, nivel, resumo, duracao_du, pct_concluido, inicio_real, termino_real, bac, custo_real, sinapi, lead_time, snet, versao |
| `vinculo` | obra_id, pred_id, succ_id, tipo (FS/SS/FF/SF), lag_du |
| `atribuicao` | tarefa_id, recurso_id, unidades |
| `linha_base` | id, obra_id, numero (0–10), criada_em, criada_por, motivo |
| `linha_base_tarefa` | linha_base_id, tarefa_id, inicio, termino, duracao, custo |
| `snapshot` | id, obra_id, data_status, criado_em, criado_por, pv, ev, ac, … (SPEC-04) |
| `snapshot_tarefa` | snapshot_id, tarefa_id, pct, custo_real, inicio_prev, termino_prev, folga |
| `relato` / `restricao` / `insumo` / `pedido` | conforme SPEC-08/09 |
| `auditoria` | **Ciclo 00013 (criada):** id (identity), empresa_id, obra_id, usuario_id (pseudônimo), entidade, entidade_id (uuid), acao (criar, alterar, arquivar, restaurar), antes e depois (jsonb, só os campos alterados da lista branca), versao_depois, origem, motivo, correlacao_id, em. **Sem IP** (Q6; ver SPEC-02 RF-02.4). Append-only em três camadas (ADR 00009) |

## 6. Requisitos não funcionais
- **RNF-01.1** p95 abaixo de 300 ms para leituras de obra com até 3.000 tarefas; recálculo de CPM abaixo de 1 s.
- **RNF-01.2** Backup diário com retenção definida pela Infra; teste de restauração trimestral.
- **RNF-01.3** Docker Compose de desenvolvimento com API + PostgreSQL + Redis (estende o `docker-compose.yml` atual).
- **RNF-01.4** Migrações de banco versionadas (EF Core Migrations ou Flyway).

## 7. Critérios de aceite
- [ ] Dois usuários em navegadores diferentes veem a mesma obra e o mesmo EVM.
- [ ] Os testes de paridade (CPM/EVM/cenários) do front passam no backend com o mesmo resultado.
- [ ] O JSON do protótipo importado reproduz os mesmos indicadores.
- [ ] Edição simultânea gera 409 e não sobrescreve em silêncio.

## 8. Riscos
- Divergência entre o motor TypeScript e o do backend → manter **um só motor** no servidor e o front apenas exibindo; os testes de paridade bloqueiam o merge.
- Escopo grande → entregar por módulo, na ordem cronograma/EAP, EVM, suprimentos e campo.
