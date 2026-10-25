---
issue: —
spec: SPEC-01 (RF-01.1 obras, RF-01.1b, RF-01.4), SPEC-02 (RF-02.4 base e obra, sem IP; RF-02.5), SPEC-14 (RF-14.3 no servidor), SPEC-12 (RF-12.5 limite na exportação, RF-12.9), ASVS 5.0.0 V1, V2, V4, V8, V14, V16, PLANO-FASE-2 §5.3, §8.2 e §10
branch: feat/00013-obras-auditoria
base: feat/00012-identidade-empresas (0f64c17) (PR empilhado enquanto o 00012 não entrar na master)
faixa: 3 (T3, T5, T8)
ficha_ou_plano: .claude/ciclos/00013-obras-auditoria-plano.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00013 — Obras no servidor, trilha de auditoria append-only e concorrência otimista

## Resumo
- **O que é:** a obra passa a existir no servidor. Nascem dois padrões que os próximos ciclos herdam. Contém:
  - tabelas `obra`, `auditoria`, `uf_referencia` (27 UFs semeadas pela migração) e `municipio_referencia` (vazia);
  - `GET`/`POST /api/v1/obras`, `GET`/`PUT /api/v1/obras/{id}`, `POST /api/v1/obras/{id}/arquivar` e `/restaurar`;
  - concorrência otimista: `versao bigint` por gatilho; versão velha recebe 409 com o estado atual; obra de outra empresa dá 404, nunca 409;
  - trilha append-only em três camadas (`REVOKE`, RLS só SELECT/INSERT, gatilho de instrução `ENABLE ALWAYS`), gravada na mesma transação da mudança;
  - `GET /api/v1/obras/{id}/auditoria` (keyset) e `GET /api/v1/auditoria/exportacao.csv`, com neutralização de fórmulas, cota por usuário e linha final `#fim;n`;
  - teste genérico de isolamento com `{id}` de obra **real** da empresa B;
  - regras R18 (bloqueia) e R19 (alerta) no `validar-regras`; ADR 00009.
- **Decidido:**
  - gate Q1 a Q8 (plano §15): Q1 arquivar em vez de apagar; Q2 `versao` explícita por gatilho; Q3 seed das 27 UFs por migração (exceção ao ADR 00004); Q4 `responsavel_id` com FK composta para o vínculo; Q5 nome único entre as obras não arquivadas (opinião de produto); Q6 sem IP e `motivo` opcional; Q7 `municipio_referencia` vazia, sem FK; Q8 `data_status` pode ser nula;
  - plano aprovado sem dividir, com a linha de corte no E3 (gate);
  - ADR novo é o 00009 (gate);
  - `especialista-obra` dispensado: o único gatilho seria o CSV da trilha, que é dado técnico e não número de obra (gate);
  - emenda 01: os 4 ajustes do parecer do `dba` (`00013-tarefa0-dba.md`, `VEREDITO: AJUSTAR`);
  - rodada 02: cota da exportação por usuário, e não por IP;
  - rodada 02: linha final `#fim;n` no CSV. Isso muda o formato do §05 e do AC-15 do plano (emenda: o usuário toma ciência no PR);
  - rodada 02: migração refeita como `20261025201449_ObrasAuditoria`, com o índice e a FK da trilha, no lugar de uma migração nova;
  - rodada 02: `appsettings.Development.json` silencia as categorias `Update` e `Database.Command` do EF;
  - rodada 02: faixa de datas da exportação de 2000-01-01 até hoje + 1 ano;
  - rodada 03: `opcoes_cronograma` recusa número em notação exponencial ou com mais de 32 caracteres.
  - Todas: **decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR.** O ADR 00009 fica "Proposto" até o aceite do usuário.
- **O que você precisa fazer:**
  - **antes do merge:** conferir os 27 códigos de UF contra a fonte oficial do IBGE (V-1, bloqueia o merge);
  - revisar no PR o gate Q1 a Q8, as decisões das rodadas e a emenda do formato do CSV (`#fim;n`);
  - recriar o banco local se ele foi migrado antes da troca do id da migração;
  - fazer merge da `master` antes do PR; o PR é empilhado em `feat/00012-identidade-empresas` se o 00012 não tiver entrado;
  - conferir os jobs do backend e o CodeQL C# verdes no PR;
  - levar à **Segurança da Informação**, ao **Jurídico** e à **Infraestrutura** os itens da última seção.
- **Estado:** validadores aprovados até a rodada 02, rodada 03 em validação (testes) e auditoria independente pendente.
  - `testes`: APROVADO na r01 (409 3x) e na r02 (434 3x); r03 (451 3x).
  - `arquiteto`: REPROVADO na r01 (R-1) → APROVADO na r02 (N-1 a N-6).
  - `dba`: OK na r01 (6 observações) e na r02.
  - `seguranca`: APROVADO na r01 → REPROVADO na r02 (1 Médio) → APROVADO na r03 (5279222), sem achados.
  - Auditoria independente: A PREENCHER.

## Pedido
"Pode fazer todas as fases" → PLANO-FASE-2 §5.3, ciclo 00013.

## Triagem
- **T3 SIM:** formato novo de exportação (CSV da trilha). Sem MSPDI.
- **T5 SIM:** dado pessoal na trilha (`usuario_id` pseudônimo, `motivo` em texto livre); entrada externa (corpo JSON, `opcoes_cronograma`); CSV que sai do sistema.
- **T8 SIM:** 8 rotas novas, 4 tabelas, gatilhos, RLS, privilégios e migração.
- **T1, T2, T4, T6, T7 NÃO:** sem cálculo, sem preço SINAPI, front intacto, sem compose, CI ou Dockerfile.
- **Faixa 3.** O `classificar-diff.mjs` confirma: faixa 3, T8, `seguranca` obrigatório, `especialista-obra` não exigido (`testes` r01: 94 arquivos de código; r02: 99). O `especialista-obra` foi dispensado no gate, apesar de T3 = sim (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR).

## Commits
| SHA | Conteúdo |
|---|---|
| 5abf659 | Plano do ciclo, parecer do `dba` (tarefa 0) e gate |
| 818db3e | E1: obras, trilha de auditoria append-only e versão por gatilho |
| e1ae024 | E2: CRUD de obras com arquivamento, versão e 409 com o estado atual |
| 2c64bd5 | E3: leitura e exportação CSV da trilha com neutralização de fórmulas |
| bd508ed | E4: ADR 00009 (trilha append-only e concorrência), regras R18 e R19, documentação |
| a2bbad5 | Rodada 02: R18 e R19 mais fortes, índice e FK da trilha (migração refeita), cota por usuário, `#fim;n`, faixa de datas, UF conferida antes, montador único do isolamento |
| 5279222 | Rodada 03: número exponencial em `opcoes_cronograma`, R18 com `MERGE` e aspas escapadas, nota de recriar o banco local |

## Rodadas
| Rodada | testes | arquiteto | dba | seguranca |
|---|---|---|---|---|
| 01 (bd508ed) | APROVADO: 409/409 3x; subida local completa (V-2); defeito de teste no T77 (não bloqueia) | REPROVADO: R-1 (R18 com falso negativo, Alta); R-2 Média; R-3 a R-5 Baixas; R-6 registro; avaliação dos 17 desvios | OK: 6 observações (2 MÉDIA, 4 BAIXA) | APROVADO: 4 Baixos e 5 Info |
| 02 (a2bbad5) | APROVADO: 434/434 3x; subida local refeita com a migração nova; 2 defeitos de teste (não bloqueiam) | APROVADO: N-1 a N-6, nenhuma bloqueia | OK: migração refeita confere com a original mais as 2 mudanças pedidas; alerta de recriar o banco local | REPROVADO: 1 Médio (número exponencial no `jsonb`); 3 Info |
| 03 (5279222) | APROVADO: 451/451 3x; 111/111 das regras; 2 defeitos menores de teste (POST sem afirmar ausência de gravação; PUT sem afirmar a chave) | APROVADO (confirmação): ADR 00004, camadas e documentação ok; N-1 e N-6 fechados; N-2 a N-4 como registro; N-5 fechado | — (sem mudança de banco) | APROVADO: sem achados; 79/79 focados e 111/111 das regras |
| auditoria | — | — | — | A PREENCHER (`revisor` MODO AUDITAR) |

### Testes do backend, antes → depois
| Ponto | Total | Fonte |
|---|---|---|
| Fim do 00012 | 201 | registro do 00012 |
| E1 (818db3e) | 318 | `dev-backend` |
| E2 (e1ae024) | 366 | `dev-backend` |
| E3 (2c64bd5) e E4 (bd508ed) | 409 | `dev-backend`; `testes` r01: 409/409 3x |
| Rodada 02 (a2bbad5) | 434 (+25) | `dev-backend` e `testes` r02, 3 execuções |
| Rodada 03 (5279222) | 451 (+17) | `dev-backend`; `testes` r03 (451/451 3x) |

Regras do `validar-regras` (`node --test`): 40 no fim do 00012, 77 em bd508ed, 106 em a2bbad5, 111 em 5279222 (`dev-backend`; `testes` confirmou 77 e 106; `seguranca` r03 confirmou 111).

### Desvios do plano e avaliação do `arquiteto`
| # | Desvio declarado pelo `dev-backend` | Avaliação do `arquiteto` (r01) e destino |
|---|---|---|
| 1 | T32: controle negativo com a própria `Obra` (`atualizada_em` e `versao` nunca entram no JSON), sem entidade de teste | Aceitável |
| 2 | `Content-Disposition` sai `attachment; filename=auditoria-AAAAMMDD.csv; filename*=UTF-8''...`, sem aspas; o AC-15 escrevia `filename="..."` | Aceitável com registro (RFC 6266 aceita; nome fixo). Pendência registrada |
| 3 | Rotas de coleção fora do grupo (`MapGet("")` no grupo gera `/api/v1/obras/`) | Aceitável com registro. Em a2bbad5 o dev confirmou a barra final e criou `Toda_rota_de_obras_e_auditoria_exige_a_politica_empresa_ativa`; o `arquiteto` r02 considerou o risco fechado |
| 4 | Limite de 64 KB por middleware próprio (`LimiteDeCorpoMiddleware`, `LimiteDeCorpoMetadata`, `CorpoLimitadoStream`), fora da lista do plano | Aceitável com registro. Não é terminal; fica antes de `UseAuthentication`. Kestrel real não exercitado: pendência |
| 5 | 409 novo `obra-nao-arquivada` (restaurar obra ativa) | Aceitável com registro (ADR 00009 e README) |
| 6 | Obra que some entre leitura e gravação dá `23503 fk_auditoria_obra` (o EF insere a trilha antes do `UPDATE`); mapeado para 404 | Aceitável com registro. Log de aviso só com `obra_id` em a2bbad5 (R-4) |
| 7 | T38 e T39 com `SaveChangesInterceptor` só no contexto do teste | Aceitável |
| 8 | `motivo` guardado como digitado, sem `Trim` | Aceitável |
| 9 | UF inexistente podia responder na chave `municipioIbge` | Aceitável com registro. Corrigido em a2bbad5: `ConferirUfsAsync` devolve 400 na chave `uf` |
| 10 | T11 conta `municipio_referencia` logo após a migração, antes da semente | Aceitável |
| 11 | T18 roda como superusuário com `SET LOCAL ROLE cronoai_app` em `BEGIN ... ROLLBACK` | Aceitável com registro (desvio do S-8: o migrador não é membro de `cronoai_app`) |
| 12 | `appsettings.json` não alterado; limites da exportação no código | Aceitável |
| 13 | R19 sem `\b` em `auditoria` (`_` é caractere de palavra) | Aceitável |
| 14 | Índices de FK extras do EF aceitos (`ix_municipio_referencia_uf`, `ix_obra_empresa_id_responsavel_id`, `ix_obra_sinapi_uf`, `ix_obra_uf_municipio_uf_cod`) | Aceitável com registro; o `dba` decide (observação 4: pendência) |
| 15 | Cabeçalho do `validar-regras.mjs` passou a listar R14 a R19 | Aceitável |
| 16 | Testes extras (Down da migração, cursor, corpo em fluxo, corrida de versão e outros) | Aceitável |
| 17 | Checkpoint do E2 (1,5×) sem linha de base de tempo | Aceitável com registro: o E3 foi entregue, a linha de corte perdeu o objeto |
| — | `arquivar` e `restaurar` declaram 413, fora da tabela do §3.7 | Registro pedido pelo `arquiteto` (R-6): coerente com o limite de corpo |
| N-2 | `#fim;n` fora das aspas muda o §05 e o AC-15 (deixa de valer "todo campo entre aspas"; o Excel mostra uma linha a mais) | Registro (`arquiteto` r02). Emenda do formato: decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR; o usuário toma ciência no PR (V-3) |
| N-3 | Cota da exportação por usuário; o plano §3.8 dizia "10/min por IP" | Registro (`arquiteto` r02). Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| N-4 | `appsettings.Development.json` fora da lista de arquivos do plano | Registro (`arquiteto` r02). Justificado e testado (`LogsObraTestes`) |

### Matriz de verificação (HEAD 5279222; cada linha com a evidência da rodada indicada; revalidação da r03 pelo `testes`: APROVADO, 451/451 3x)

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| G-restore | Lock files | `dotnet restore --locked-mode` | sim | PASS | 4 projetos restaurados (`testes` r01 e r02); ok no HEAD 5279222 (`dev-backend` r03) |
| G-build | Build Release sem avisos | `dotnet build CronoAI.slnx -c Release --no-incremental` | sim | PASS | `0 Aviso(s) 0 Erro(s)` (`testes` r02, a2bbad5); 0/0 no HEAD 5279222 (`dev-backend` r03) |
| G-format | Format limpo | `dotnet format … --verify-no-changes` | sim | PASS | exit=0 (`testes` r02); limpo em 5279222 (`dev-backend` r03) |
| G-test | Suíte completa | `dotnet test --solution CronoAI.slnx -c Release --no-build` | sim | PASS | 409/409 3x (`testes` r01, bd508ed); 434/434 3x (`testes` r02, a2bbad5); 451/451 3x (`testes` r03, 5279222) |
| G-openapi | Contrato bate com o build | `git diff --exit-code -- server/openapi/` | sim | PASS | exit=0 (`testes` r01 e r02) |
| G-pending | Sem migração pendente | `dotnet ef migrations has-pending-model-changes` | sim | PASS | `No changes have been made to the model since the last migration.` (`testes` r01 e r02; `dev-backend` r03) |
| G-vuln | Sem pacote vulnerável | `dotnet list … --vulnerable --include-transitive` | sim | PASS | "não tem nenhum pacote vulnerável" nos 4 projetos (`testes` r01 e r02) |
| G-node | Regras R18 e R19 | `node --test .claude/scripts/lib/regras-cronoai.test.mjs` | sim | PASS | `tests 106 pass 106 fail 0` (`testes` r02); 111/111 em 5279222 (`seguranca` r03) |
| G-regras | validar-regras | `validar-regras.mjs --base feat/00012-identidade-empresas --commits` | sim | PASS | `114 arquivo(s) … 0 bloqueia, 0 alerta` (`testes` r02); 0/0 em 5279222 (`dev-backend` r03) |
| G-classif | classificar-diff | `classificar-diff.mjs --commits` | sim | PASS | faixa 3, T8, `seguranca` obrigatório, `especialista-obra` não exigido (`testes` r01 e r02) |
| AC-1 | Build, format, testes, OpenAPI | gates acima | sim | PASS | G-build, G-format, G-test, G-openapi (r02) |
| AC-2 | Migração | X1, `Migracao_ObrasAuditoria_down_remove_tudo_e_reaplica`, `Modelo_sem_mudanca_pendente`, subida local | sim | PASS | verdes 3x (r01, r02). Subida local r02: `ef database update` aplicou `Inicial`, `IdentidadeEmpresas` e `20261025201449_ObrasAuditoria`, "Done." (`testes`). `dba` r02: `diff` com a original só mostra as 4 mudanças pedidas; 17/17 em `MigracoesTestes`, `CatalogoTestes`, `AppendOnlyTestes` |
| AC-3 | Referências | T10 a T12, T29, X2, X4 | sim | PASS | 27 linhas exatas; `municipio_referencia` vazia; INSERT do app dá 42501; T29 prova `NOT VALID` → `VALIDATE` na gêmea (r01). Conferência no IBGE: V-1 |
| AC-4 | RLS de obra e auditoria | T13 a T15, T44, X2, X3, X6, `Predicados_das_politicas_sao_os_do_plano` | sim | PASS | `qual` e `with_check` exatos; negativos de UPDATE sem `WHERE` nem `RETURNING`, com `SET` constante; `SET empresa_id = B` dá 42501 (r01). Mutação do dev: cada afrouxamento de política reprova teste. `dba` r01 confirma que `SET x = x` mascararia `USING (true)` (https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |
| AC-5 | Append-only em 3 camadas | T16 a T19, X3, X4 | sim | PASS | catálogo `["trg_auditoria_append_only|A|58"]`; app sem UPDATE, DELETE, TRUNCATE, TRIGGER e REFERENCES; dono recebe `restrict_violation` com 0 linhas e TRUNCATE; GRANT em transação desfeita e o gatilho ainda recusa (r01). Mutações do dev detectadas |
| AC-6 | Versão e 409 | T21 a T23, T52, T54, T58 | sim | PASS | `versao=999` enviado vira 2; 409 `conflito-de-versao` com `estadoAtual.versao == 2`; 10 PUTs paralelos dão 1×200 e 9×409, trilha `[Criar, Alterar]` (r01); 409 reproduzido por curl (r01, r02) |
| AC-7 | 404 × 409 × 400 | T38, T39, T51, T53, T55, T57 | sim | PASS | T55: 404, nunca 409, sem o nome de B, B intacta; T53: 400 só na chave `versao`; T57: 409 `obra-arquivada` (r01). `testes` não aprofundou o gancho do T38 e do T39 |
| AC-8 | Auditoria na mesma transação | T30 a T34, T45, T52, T54, T56, T64, T67 | sim | PASS | falha da obra ou da trilha desfaz as duas (contagem como superusuário); só campos alterados; PUT sem mudança mantém versão e 1 auditoria (r01) |
| AC-9 | Minimização e falha fechada | T08, T32, T35 a T37, T70 | sim | PASS | `SaveChanges` comum com entidade auditável lança; `Remove` lança; subida local: trilha sem nome nem IP (r01). `testes` não leu o fim do T37 |
| AC-10 | Validação | T03, T04, T24 a T27, T46 a T49; `ValidacaoEntradaObraTestes` | sim | PASS | verdes 3x (r01). `empresaId` de B e `versao: 9` no POST ignorados (curl, r01). UF `XX` dá 400 na chave `uf` (r02). Borda do `jsonb`: 1365 pares passam, 1366 dão 400 (r02). Exponencial e mais de 32 caracteres dão 400 (5279222, `dev-backend`; `seguranca` r03 mediu no PostgreSQL 17); `testes` r03 confirmou (`Obra_opcoes_recusa_numero_exponencial...`, 451/451 3x) |
| AC-11 | Nome único | T28, T61, T62 | sim | PASS | verdes 3x (r01) |
| AC-12 | Arquivar e restaurar | T05, T20, T50, T59, T60, T65, X4 | sim | PASS | DELETE no banco dá 42501; DELETE na API dá 405; listagem padrão sem arquivadas; trilha `arquivar` v3 (r01, curl) |
| AC-13 | Isolamento | T63, T74, T77, X5, `Toda_rota_de_obras_e_auditoria_exige_a_politica_empresa_ativa` | sim | PASS | 8 rotas no catálogo; X5 com obra real de B; T74: `obraId` de B dá 404 (r01). T77 e X5 com o mesmo `RequisicaoDeIsolamento.Montar`; T77 extrai o id da requisição real (r02). Piso de rotas virou `== 8` (5279222) |
| AC-14 | Trilha por obra | T68 a T70, `CodificadorCursorAuditoriaTestes` | sim | PASS | ordem DESC; só `usuarioId`; 404 idêntico para obra alheia ou inexistente (r01) |
| AC-15 | CSV | T06, T07, T71 a T73, T75, T76; testes do `#fim` | sim | PASS (formato emendado) | BOM, `;`, CRLF, aspas, neutralização de `= + - @ TAB CR` com controle negativo; 366 dias passa, 367 dá 400 (r01). Cota por usuário: anônimo 10×401 sem 429, B ainda 200 (r02). `#fim;n` e arquivo cortado sem `#fim` (r02). Datas fora da faixa dão 400 (r02). Emenda do formato (N-2): ciência do usuário no PR. `Content-Disposition` sem aspas: pendência |
| AC-16 | R18/R19 e arquitetura | T40 a T43, T78, T79, `Sem_SQL_de_escrita_em_obra_ou_auditoria_fora_de_migracao`, G-regras | sim | PASS | R18 acusa a própria linha do SQL, sem schema, com aspas, `ONLY` e `ExecuteSqlInterpolatedAsync` (r02); `MERGE INTO` e aspas escapadas (5279222; `seguranca` r03 conferiu por sonda). R19 ampliada e `r19PorInstrucao` (r02). A migração real não aciona |
| AC-17 | Documentação | `git diff --name-only` | sim | PASS | ADR 00009 `Proposto`, ADRs 00004 e 00006, `adrs/README.md`, `backend-dotnet.md`, checklist ASVS, SPEC-01 §5, SPEC-02 RF-02.4, `CLAUDE.md`, `server/README.md` (r01, r02). README com recriar banco local e conferência do `#fim` por parser RFC 4180 (5279222) |
| AC-18 (diff) | Front intacto | `git diff --name-only feat/00012-identidade-empresas...HEAD` | sim | PASS | nada em `src/`, `e2e/`, `Dockerfile`, `docker/`, `docker-compose` nem `.github/` (r01, r02) |
| AC-18 (`npm run ci`) | `npm run ci` verde | `npm run ci` no worktree c13 | sim | PASS | orquestrador, rodada 01: `Test Files 10 passed (10)`, `Tests 67 passed (67)`, `Statements : 92.79% ( 1817/1958 )`, `✓ built`, exit=0 (`scratchpad\c13-npm-ci.log`); `testes` r01 também PASS (G-11). Não repetido depois: o front não mudou |
| AC-19 | DV do IBGE | T01, T02, T47 | sim | PASS | casos 3550308, 2611606, 5300108, 2699999 (r01) |
| AC-20 | Logs | T66, `LogsObraTestes` | sim | PASS | id da obra no log como controle; "Obra Ficticia" e `cmd|calc` com 0 ocorrências no log da subida local (r01, r02). Teste de Development renomeado e comentado: a proteção real é o teste do `appsettings.Development.json` (5279222) |
| R-1 | Camadas | `ArquiteturaTestes` | sim | PASS | `Api → Dados → Dominio`; domínio só com `System.Text.Json` (r01) |
| R-2 | DDL só em migração; DML de migração só pelo helper | R15 + leitura | sim | PASS | `validar-regras` 0 bloqueia; semente por `InsertData` em tabela sem RLS (r01, r02) |
| R-3 | Estilo do ADR 00004 | leitura do `arquiteto` | sim | PASS | R-5 da r01 corrigido em a2bbad5; `arquiteto` r02 APROVADO. mudanças da r03 confirmadas pelo `arquiteto` (APROVADO) |
| S-1 | Sem segredo versionado | `ConfiguracaoTestes`, R08 | sim | PASS | verdes; `.env` da subida local fora do repositório (r01) |
| S-2 | Nenhuma dependência nova | diff de `Directory.Packages.props` e dos lock files | sim | PASS | sem mudança (`dev-backend`; `seguranca` r01) |
| S-3 | Atribuição em massa | T46 | sim | PASS | `empresaId` e `versao` do corpo ignorados; `EmpresaId` com `AfterSaveBehavior.Throw` (r01) |
| S-4 | CSRF nas escritas novas | `Toda_escrita_exige_antiforgery` | sim | PASS | enumera POST, PUT, arquivar e restaurar (`seguranca` r01) |
| S-5 | Injeção de fórmula no CSV | T06, T07, T72 | sim | PASS | `'=1+1` e controles intactos; motivos maliciosos pela API (r01). `#fim` não forjável por conteúdo (`seguranca` r02) |
| S-6 | Limites de corpo e de `jsonb` | T49, T24, borda do `jsonb`, exponencial | sim | PASS | 413 acima de 64 KB, inclusive chunked no TestServer (r01); teto pelo texto normalizado (r02); exponencial e mais de 32 caracteres recusados (5279222, `seguranca` r03) |
| S-7 | Erro sem detalhe interno | T47, T48; `MapeadorErrosObraTestes` | sim | PASS | 400 por campo sem texto do PostgreSQL (r01); `ck_auditoria_antes_tamanho` e `ck_auditoria_depois_tamanho` → 400 (5279222) |
| S-8 | Testes de banco como `cronoai_app` | leitura | sim | PASS (com ressalva) | superusuário só na fixture; T18 usa `SET LOCAL ROLE cronoai_app` (desvio 11, aceito com registro pelo `arquiteto` r01) |
| V-1 | **Usuário confere os 27 códigos de UF contra a fonte oficial do IBGE** | registro no ciclo | **sim, bloqueia o merge** | NOT_RUN | pendente do usuário. `dev-backend` e `dba` conferiram contra a lista passada pelo orquestrador (11 RO … 53 DF); `testes` conferiu o teste contra o §07.4. Nada disso é a fonte oficial. O orquestrador conferiu os 27 códigos da migração `20261025201449_ObrasAuditoria` contra a tabela IBGE conhecida (11 RO … 53 DF): batem; isso não substitui a conferência do usuário na fonte oficial |
| V-2 | Subida local: criar, editar, 409, arquivar, exportar | compose descartável, API em Development por HTTPS, curl | não | PASS | r01 (`-p cronoai-qa13`, porta 55433) e r02 (`-p cronoai-qa13b`, porta 55434): login 204; POST 201 `versao:1`; PUT v1 200; PUT v1 de novo 409 com `estadoAtual.versao:2`; sem versão 400; arquivar 200; PUT em arquivada 409; DELETE 405; CSV com BOM, CRLF e `#fim;3`; limpeza com 0 containers e `git status` vazio. Excel não aberto |
| V-3 | Usuário revisa Q1 a Q8 e a emenda do CSV no PR | PR | sim | NOT_RUN | depende do PR |
| E2E | `npm run e2e` | — | não | NA | front intacto |
| R02 | Rodada 02: 15 itens | `testes`, `arquiteto`, `dba` e `seguranca` sobre a2bbad5 | sim | PASS | `testes` r02 APROVADO (434 3x, N-1 a N-11 PASS); `arquiteto` r02 APROVADO; `dba` r02 OK; mutações do dev detectadas (cota compartilhada, sem `#fim`, contagem n+1, sem faixa de datas, sem `fk_auditoria_empresa` e outras). `seguranca` r02 REPROVADO pelo Médio novo → rodada 03 |
| R03 | Rodada 03: exponencial, `MERGE`, aspas escapadas, README, testes de log e piso | `testes` e `seguranca` sobre 5279222 | sim | PASS | `seguranca` r03 APROVADO, sem achados (79/79 focados, 111/111). Mutação do dev: sem a recusa de exponencial, 5 falhas; sem o teto de 32, 1; sem o mapeamento, 1. `testes` r03: 451/451 3x, N-1 a N-7 PASS (recusa de `1e131071`, `1e-16383`, `1E5`, `[1,2.5e3]` e 33 caracteres; controle com 5 números de até 32 caracteres; PUT com versão e trilha intactas; `MapeadorErrosObraTestes`; R18 e detector com MERGE e aspas escapadas; piso `== 8`). `arquiteto` r03 APROVADO |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | A PREENCHER | A PREENCHER |

## Ressalvas dos validadores e destino
| Origem | Ressalva | Destino |
|---|---|---|
| testes r01 / r02 | 27 códigos de UF não conferidos contra o IBGE | pendência do usuário (V-1, bloqueia o merge) |
| testes r01 | T77: o meta-teste não prova que o X5 passa o id real | corrigido (a2bbad5): `RequisicaoDeIsolamento.Montar` único; T77 extrai o id da requisição real |
| testes r01 | Gancho do T38 e do T39 não aprofundado; fim do T37 não lido | registrado |
| testes r01 | R-3 (estilo) fora da competência do `testes` (NA) | registrado: coberto pelo `arquiteto` |
| testes r01 | `Content-Disposition` com `filename=` e `filename*=`: superconjunto do plano, não é defeito | pendência registrada |
| testes r01 | Em HTTP, antiforgery e cookie `__Host-` dão 500 | registrado: o README já manda usar HTTPS |
| testes r02 | `Em_Development_o_409_de_nome_duplicado_nao_leva_o_nome_ao_log_do_EF` passa sem a mitigação | corrigido (5279222): renomeado e comentado; a proteção real é o teste do `appsettings.Development.json` |
| testes r02 | Piso `endpoints.Count >= 8` frouxo | corrigido (5279222): `== 8` |
| testes r02 | Consultas de catálogo no `psql` da subida local falharam (operador `text || "char"`) | registrado: FK, índice e gatilho cobertos por teste em PASS |
| testes r02 | `npm run ci` não repetido | registrado: front intacto; passou na r01 (orquestrador e `testes`) |
| arquiteto r01 | R-1 (Alta): R18 com falso negativo (SQL na linha seguinte, bloco `$"""`, tabela sem schema) | corrigido (a2bbad5): R18 acusa a própria linha do SQL; teste de arquitetura equivalente |
| arquiteto r01 / seguranca r01 | R-2 / achado 7: R19 não acusa vários afrouxamentos | corrigido (a2bbad5): R19 ampliada e `r19PorInstrucao` |
| arquiteto r01 | R-3: braço `_ => Conflito` no POST | corrigido (a2bbad5): `UnreachableException` |
| arquiteto r01 | R-4: `fk_auditoria_obra` → 404 sem log | corrigido (a2bbad5): aviso só com `obra_id` (EventId 25) |
| arquiteto r01 | R-5: campo na região errada e linha em branco extra | corrigido (a2bbad5) |
| arquiteto r01 | R-6: registro do ciclo ausente; desvios a registrar; 413 em arquivar e restaurar | corrigido neste registro ("Desvios do plano") |
| arquiteto r01 | 17 desvios declarados | avaliados e registrados ("Desvios do plano") |
| arquiteto r01 | Desvio 3 sem confirmação da barra final | corrigido (a2bbad5): barra final confirmada e teste da política em toda rota |
| arquiteto r01 | Desvio 9: UF inexistente com mensagem de município | corrigido (a2bbad5): `ConferirUfsAsync` |
| arquiteto r01 | Desvio 11: S-8 com superusuário + `SET LOCAL ROLE` | registrado (S-8 com ressalva) |
| arquiteto r01 | Middleware: "não honrado" deve ter sido só no TestServer; vale registrar | pendência registrada (Kestrel real não exercitado) |
| arquiteto r02 | N-1: R18 sem `MERGE INTO` | corrigido (5279222) |
| arquiteto r02 | N-2: `#fim;n` muda o §05 e o AC-15 | registrado: emenda do formato (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR); ciência do usuário no PR (V-3) |
| arquiteto r02 | N-3: cota por usuário em vez de por IP | registrado (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| arquiteto r02 | N-4: `appsettings.Development.json` fora da lista | registrado (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| arquiteto r02 | N-5: `TamanhoNormalizado` subestima números (`1e400`) | corrigido (5279222), junto com o Médio da `seguranca` r02 |
| arquiteto r02 | N-6: banco local migrado antes da troca do id falha | corrigido (5279222): linha no `server/README.md`; pendência de recriar o banco |
| arquiteto r02 | Bloco sem `;` só é avaliado no fim do arquivo (R19) | registrado (sem importância, segundo o `arquiteto`) |
| dba r01 | 1 (MÉDIA): exportação sem índice para o ORDER BY | corrigido (a2bbad5): `ix_auditoria_empresa_id (empresa_id, id)` na migração refeita |
| dba r01 | 2 (MÉDIA): trilha "fantasma" em transação explícita | corrigido (a2bbad5) na documentação (ADR 00009, `backend-dotnet.md`); teste no 00015: pendência |
| dba r01 | 3 (BAIXA): `auditoria.empresa_id` sem FK | corrigido (a2bbad5): `fk_auditoria_empresa` Restrict |
| dba r01 | 4 (BAIXA): índices de FK de baixo valor | pendência registrada |
| dba r01 | 5 (BAIXA): keyset da trilha por obra com OR | pendência registrada |
| dba r01 | 6 (BAIXA): FKs de UF redundantes, mensagem trocada | pendência registrada; a mensagem foi mitigada por `ConferirUfsAsync` (a2bbad5) |
| dba r01 | Seed sem `ON CONFLICT` | registrado: a migração roda uma vez; o Down remove a tabela |
| dba r01 | `EXPLAIN (ANALYZE, BUFFERS)` em volume não feito | pendência registrada (com as observações 4 e 5) |
| dba r02 | Migração trocada em vez de nova: banco local com o id antigo falha | pendência registrada (recriar o banco local). Aceitável só porque a migração não saiu do local; confirmar no PR |
| seguranca r01 | 1 (Baixo): em Development, nome e linha no log do EF; teto de 16 KB pelo texto cru | corrigido (a2bbad5): `appsettings.Development.json` com `None` e teto pelo texto normalizado do `jsonb` (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| seguranca r01 | 2 (Baixo): R18 não pega `ExecuteSqlInterpolated`, aspas, SQL multilinha | corrigido (a2bbad5) |
| seguranca r01 | 3 (Baixo): limite da exportação por IP, antes da autenticação | corrigido (a2bbad5): cota por usuário, filtro depois da autorização (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR). Proxy: Infraestrutura |
| seguranca r01 | 4 (Baixo): página inteira em memória; CSV cortado indistinguível | corrigido (a2bbad5): escrita linha a linha, flush por página e `#fim;n`. Teto de linhas (opcional) não implementado: registrado |
| seguranca r01 | 5 (Info): comentário do cursor errado | corrigido (a2bbad5). Assinatura do cursor (opcional): registrado |
| seguranca r01 | 6 (Info): `9999-01-01..9999-12-31` dá 500 | corrigido (a2bbad5): faixa de 2000-01-01 a hoje + 1 ano (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| seguranca r01 | 7 (Info): R19 não alerta vários afrouxamentos | corrigido (a2bbad5); o helper `PoliticaUpdate("auditoria")` segue fora: pendência Info |
| seguranca r01 | 8 (Info): `＝` (U+FF1D) ou espaço + `=` no Excel pt-BR | pendência registrada (Info) |
| seguranca r01 | 9 (Info): todo membro lê a trilha da empresa; o 409 de nome duplicado revelará obra fora do alcance no 00014 | pendência registrada (00014) |
| seguranca r01 | Append-only não garante autenticidade: o app pode inserir qualquer `usuario_id` | pendência de área (Segurança) |
| seguranca r02 | 1 (Médio): número exponencial no `jsonb` (`1e131071` vira 131.079 bytes; ~1,5 s e ~131 MB por requisição; PUT dava 500) | corrigido (5279222): recusa de exponencial e de mais de 32 caracteres; `ck_auditoria_*_tamanho` → 400 (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| seguranca r02 | 2 (Info): R18 sem aspas escapadas e sem `MERGE INTO` | corrigido (5279222) |
| seguranca r02 | 3 (Info): R19 não pega o helper `PoliticaUpdate("auditoria")` | pendência registrada (Info; o teste de catálogo cobre) |
| seguranca r02 | 4 (Info): `#fim` diante de leitor ingênuo por linha | corrigido (5279222) na documentação: conferir com parser RFC 4180 e contagem |
| seguranca r02 | Quem tem várias contas ganha uma cota por conta | registrado (aceitável, segundo a `seguranca`) |
| seguranca r02 / dev r02 | O EF não loga nesta API (fábrica sem `ILoggerFactory`) | registrado: confirmado pela `seguranca` r02; o filtro do Development fica como defesa |
| seguranca r03 | Nenhum achado | — |
| dev-backend r01 | Limite de 64 KB em chunked provado só no TestServer | pendência registrada |
| testes r03 | POST de número exponencial não afirma que nada foi gravado; PUT não afirma a chave do erro | pendência registrada (menor): o domínio recusa antes de qualquer escrita |
| auditoria | A PREENCHER | A PREENCHER |

## Pendências registradas
- **V-1 do usuário (bloqueia o merge):** conferir os 27 códigos de UF da migração `20261025201449_ObrasAuditoria` contra a fonte oficial do IBGE.
- **Banco local:** quem migrou antes da troca do id da migração precisa recriar o banco (`docker compose --profile backend down -v`). Está no `server/README.md` desde 5279222.
- **Observações 4 a 6 do `dba` r01:**
  - 4: índices de FK de baixo valor (`ix_auditoria_usuario_id`, `ix_obra_sinapi_uf`, `ix_obra_uf_municipio_uf_cod`); remover só por migração nova;
  - 5: keyset da trilha por obra com OR; se pesar, comparar por linha `(em, id) < (@em, @id)`;
  - 6: FKs de UF redundantes; a mensagem já sai certa pelo `ConferirUfsAsync`.
  - Confirmar com `EXPLAIN (ANALYZE, BUFFERS)` num banco de teste com volume.
- **Info da `seguranca`:**
  - helper `PoliticaUpdate("auditoria")` fora da R19 (o catálogo cobre);
  - `＝` de largura total ou espaço + `=` no Excel pt-BR: testar no Excel do cliente;
  - leitura da trilha por todo membro da empresa e o 409 de nome duplicado: reavaliar no 00014;
  - cursor opaco, não assinado: assinatura opcional;
  - uma cota de exportação por conta.
- **Lista oficial de municípios:** insumo do usuário (fonte, versão e formato). Até a carga, um código inexistente com DV coincidente passa; não foi verificado se há código oficial fora da regra do DV.
- **Regra do ROLLBACK para o 00015:** em transação explícita, `DbUpdateConcurrencyException` ou `DbUpdateException` exige ROLLBACK. Está no ADR 00009 e no `backend-dotnet.md`; falta o teste no 00015.
- **`Content-Disposition`:** sai `filename=` sem aspas mais `filename*=`, e não `filename="..."` como o AC-15. Nome fixo, sem entrada do usuário. Aceito com registro pelo `arquiteto`; o usuário confirma no PR.
- **Limite de 64 KB:** provado só no TestServer; Kestrel real não exercitado.
- **Rodada 03 sem `arquiteto` nem `dba`:** a r03 mexeu em `JsonOpcoes`, `MapeadorErrosObra` e nas regras, e foi validada só pela `seguranca` e pelo `testes`.
- **Herdado do 00012, ainda aberto:** ver "Pendências registradas" do registro do 00012.
- **Antes do PR:** fazer merge da `master`. PR empilhado em `feat/00012-identidade-empresas` se o 00012 não tiver entrado.

## Validação de outras áreas (não substitui o parecer delas)
- **Segurança da Informação:**
  - aceite dos itens ASVS 5.0.0 V1, V2, V4, V8, V14 e V16;
  - limite do append-only: vale contra DML; o dono (DDL) e o superusuário contornam; guarda e backup da trilha; eventual `SECURITY DEFINER` de privacidade;
  - autenticidade do `usuario_id` na trilha depende do código do app;
  - neutralização do CSV diante do Excel pt-BR do cliente.
- **Jurídico:**
  - IP: a trilha não guarda IP (Q6), o que diverge do RF-02.4;
  - retenção e descarte da trilha; pseudonimização sob append-only (exceção controlada × partição);
  - `motivo` em texto livre, onde alguém pode digitar dado pessoal;
  - exportação da trilha para fora do sistema;
  - se o Jurídico exigir descarte por prazo antes do merge, o plano volta à etapa 3 para particionar.
- **Infraestrutura:**
  - `ForwardedHeaders` e IP real atrás de proxy (se o Jurídico aprovar IP);
  - quem roda migração em produção (o dono pode desligar o gatilho);
  - backup e restauração (a `versao` explícita sobrevive); papel de backup sob RLS;
  - PgBouncer em modo de transação vaza as variáveis de sessão (herdado do 00012);
  - limite global de corpo: as rotas de obra elevam para 64 KB se o global for menor.
