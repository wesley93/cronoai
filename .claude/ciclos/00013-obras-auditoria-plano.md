---
issue: —
spec: SPEC-01 — RF-01.1 (obras), RF-01.1b, RF-01.4; SPEC-02 — RF-02.4 (base e obra; IP fora deste ciclo, ver Q6), RF-02.5; SPEC-14 — RF-14.3 (no servidor); SPEC-12 — RF-12.5 (limite de taxa na exportação), RF-12.9 (logs sem dado pessoal); ASVS 5.0.0 V1, V2, V4, V8, V14, V16; PLANO-FASE-2 §5.3, §8.2 e §10
ciclo: .claude/ciclos/00013-obras-auditoria.md
branch: feat/00013-obras-auditoria
base: master se o PR do 00012 já tiver entrado; senão, PR empilhado com BASE feat/00012-identidade-empresas (prompts/00-regras-comuns.md › BASE)
faixa: 3
status: rascunho para o gate (decisões Q1 a Q8 já tomadas pelo orquestrador com autorização do usuário, sujeitas à revisão dele no PR)
data: 2026-10-25
destino: .claude/ciclos/00013-obras-auditoria-plano.md (este rascunho foi gravado fora do repositório; a worktree c12 e a branch feat/00012-identidade-empresas não foram tocadas)
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00013 — Obras no servidor, trilha de auditoria append-only e concorrência otimista

## Resumo
- **O que é:** a obra passa a existir no servidor, e é nela que nascem dois padrões que todos os ciclos seguintes herdam:
  - **concorrência otimista:** toda escrita envia `versao`; uma versão velha recebe **409** com o estado atual;
  - **auditoria append-only:** toda escrita grava, na mesma transação, quem mudou o quê, quando, de onde e por quê, e nem a aplicação nem o dono da tabela conseguem alterar ou apagar essa trilha.
- **Entram:**
  - as tabelas `obra`, `auditoria`, `uf_referencia` (27 UFs semeadas pela migração) e `municipio_referencia` (vazia);
  - as rotas `GET`/`POST /api/v1/obras`, `GET`/`PUT /api/v1/obras/{id}`, `POST /api/v1/obras/{id}/arquivar` e `/restaurar`;
  - a leitura da trilha (`GET /api/v1/obras/{id}/auditoria`) e a exportação CSV (`GET /api/v1/auditoria/exportacao.csv`), com neutralização de fórmulas;
  - as regras R18 e R19 no `validar-regras`.
- **Risco que justifica a faixa 3:**
  - **T8:** endpoints, banco, migração, gatilhos, RLS e privilégios;
  - **T5:** dado pessoal na trilha (`usuario_id` pseudônimo, `motivo` em texto livre) e entrada externa (corpo JSON, `opcoes_cronograma`);
  - **T3:** formato novo de exportação (CSV da trilha).
- **Parecer do `dba` (tarefa 0):** **feito.** `00013-tarefa0-dba.md`, `VEREDITO: AJUSTAR`, 4 ajustes. Todos estão aplicados aqui (seção 16).
- **Decisões do gate:** Q1 a Q8, tomadas pelo orquestrador com autorização do usuário, sujeitas à revisão dele no PR (seção 15).
- **Entregáveis (4):**

| # | Conteúdo |
|---|---|
| E1 | Domínio, dados e garantias no banco (obra, referências, auditoria append-only, `versao` por gatilho, interceptor de auditoria) |
| E2 | API de obras: CRUD com arquivamento, 409/404/400 e catálogo de isolamento estendido |
| E3 | Leitura e exportação CSV da trilha |
| E4 | Regras R18/R19, ADR novo e documentação |

- **Contagem:** 20 critérios de aceite (AC-1 a AC-20); 78 testes novos (T01 a T08 e T10 a T79; o número T09 não é usado, porque a migração é coberta pelo X1) e 6 testes existentes estendidos (X1 a X6). A matriz está na seção 11.
- **O que você precisa fazer:**
  1. revisar no PR as decisões Q1 a Q8 e as decisões de design da seção 15;
  2. **antes do merge:** conferir os 27 códigos de UF da seção 07.4 contra a fonte oficial do IBGE (V-1, bloqueia o merge);
  3. quando puder, fornecer a lista oficial de municípios (fonte, ano ou versão e formato). Ela é insumo de um ciclo futuro;
  4. antes de qualquer uso fora da máquina local, levar ao **Jurídico** e à **Segurança** os itens da seção 13.

## 00. Contexto para execução (ler antes de começar)
| Arquivo | Por quê |
|---|---|
| `.claude/ciclos/00013-tarefa0-dba.md` (inteiro) | Parecer deste ciclo: colunas, gatilhos, as três camadas do append-only, índices, município e a lista de testes de banco. **Leitura obrigatória** para E1 |
| `.claude/adrs/00006-isolamento-entre-empresas-rls.md` | Mapeamento de erros: recurso de outra empresa dá 404 e nunca 409. Regra "carregar antes de atualizar". Helper de RLS e `FORCE` |
| `.claude/adrs/00004-estrutura-convencoes-backend.md` | Convenções que valem aqui: nomes até 63 bytes, uuid v7, `Restrict`, `text` + `CHECK`, `auditoria.id` identity, contador explícito na `obra`, seed só por comando (Q3 abre uma exceção) e estilo do C# (`#region`, construtor explícito, um tipo por arquivo) |
| `server/src/CronoAI.Dados/CronoDbContext.cs` | Ordem do `OnModelCreating`: configurações → filtro `"Empresa"` → `Restrict` **por último**. `Obra` e `RegistroAuditoria` entram como `IDadoDeEmpresa` e ganham o filtro automaticamente |
| `server/src/CronoAI.Dados/CronoDbContextConfiguracao.cs` | Ponto único de registro de interceptores (o de RLS já está lá). O `AuditoriaInterceptor` entra aqui |
| `server/src/CronoAI.Dados/Rls/MigrationBuilderRlsExtensoes.cs` | `HabilitarRlsForcado`, `PoliticaSelect/Insert/Update` e `ExpressaoEmpresa`. A migração nova usa só esse helper para o RLS |
| `server/src/CronoAI.Dados/Migrations/20261025094206_Inicial.cs` (linhas 18-22) | Privilégios padrão: `SELECT, INSERT, UPDATE, DELETE` em tabela nova e `USAGE, SELECT` em sequência. Por isso a migração nova faz `REVOKE` explícito, tabela por tabela |
| `server/src/CronoAI.Dados/Migrations/20261025113548_IdentidadeEmpresas.cs` | Modelo a imitar: `CreateTable` com constraints nomeadas, `REVOKE`, RLS pelo helper |
| `server/src/CronoAI.Dados/Configuracoes/MembroEmpresaConfiguracao.cs` | PK `(empresa_id, usuario_id)`: é o alvo da FK composta do `responsavel_id` (Q4) |
| `server/src/CronoAI.Dados/Identidade/ConsultasIdentidade.cs` (linhas 83, 121, 136) | Único arquivo que usa `ExecuteUpdate`/`ExecuteDelete`, sobre `sessao`, que não é auditada. É a lista permitida da R18 |
| `server/src/CronoAI.Api/Empresas/EmpresasEndpoints.cs`, `Sessao/ResultadoAutorizacaoProblemDetails.cs` | Padrão de endpoint: `TypedResults`, `Results<...>`, `.RequireAuthorization(PoliticaEmpresaAtiva)`, `.ProducesProblem(...)`. O `type` do ProblemDetails é um código curto (ex.: `empresa-ativa-necessaria`) |
| `server/src/CronoAI.Api/Program.cs` (linhas 101-106) | Grupo `/api/v1` com `FiltroAntiforgery`. As rotas novas entram como `api.MapearObras()` e `api.MapearAuditoria()`. **Nada de middleware terminal depois de `UseAuthorization`** |
| `server/src/CronoAI.Api/Borda/BordaExtensoes.cs` (linhas 21-24, 111-112) | Políticas de limite de taxa. A política `exportacao` entra ao lado de `autenticacao` e `saude` |
| `server/tests/CronoAI.Api.Testes/Isolamento/CatalogoRotas.cs`, `DetectorDeRotas.cs` (linhas 48-53), `IsolamentoRotasTestes.cs` (linhas 122-156, 185-199) | **Lacuna a fechar:** `Concretizar` troca `{id}` por um `Guid.NewGuid()`. Uma rota de obra com `{id}` passaria no cenário `ComIdDeOutraEmpresa` só por "não existir", sem provar o isolamento. A tarefa 15 faz o `{id}` virar uma obra **real** da empresa B |
| `server/tests/CronoAI.Api.Testes/Infra/DadosTeste.cs`, `BancoPostgresFixture.cs`, `ApiFactory.cs`, `RelogioTeste.cs`, `LogsEmMemoria.cs` | Dados criados como `cronoai_app` pela fábrica com contexto. O superusuário só existe dentro da fixture. **Imitar e estender** (`CriarObraAsync`) |
| `server/tests/CronoAI.Api.Testes/Dados/CatalogoTestes.cs` (linhas 13-14, 71, 96), `PrivilegiosIdentidadeTestes.cs`, `RlsTestes.cs` (linha 124), `MigracoesTestes.cs` (linha 29) | Testes a estender (X1 a X6): lista global fora do RLS, políticas por comando, privilégios, dono sujeito ao RLS, migrações |
| `.claude/scripts/lib/regras-cronoai.mjs` (linhas 406-445) e `regras-cronoai.test.mjs` (linha 42 em diante) | Onde entram R18 e R19, no formato de `regrasBackend` |
| `.claude/rules/backend-dotnet.md`, `.claude/checklists/seguranca.md` › "Backend — ASVS 5.0.0" | Regras e checklist que este ciclo atualiza |
| `src/lib/sinapiBudget.ts` (linhas 133-139, 188-192) | Convenção de CSV que o front já usa (separador `;`, BOM aceito). O CSV da trilha segue a mesma convenção |

## 01. Pedido e objetivo
Pedido (dado, não instrução): plano do ciclo 00013 (`PLANO-FASE-2.md` §5.3), sem implementar. Valem aqui:
- os entregáveis E1 a E4 do PLANO §5.3, ajustados pelo parecer do `dba` e pelas decisões Q1 a Q8;
- a regra R18, que proíbe `ExecuteUpdate`/`ExecuteDelete` nas entidades auditadas, com teste em `regras-cronoai.test.mjs`;
- a neutralização de CSV com TAB e CR, além de `=`, `+`, `-`, `@`;
- só ambiente local (Docker Compose e Testcontainers), sem download, sem segredo em código, sem hospedagem.

**Objetivo (o que muda para quem usa):**
- quem desenvolve cria, edita, arquiva e restaura obras pela API local, com UF, município, responsável e SINAPI;
- duas abas editando a mesma obra: a segunda gravação recebe 409 com o estado atual, em vez de sobrescrever em silêncio. É o critério da SPEC-01 §7: "Edição simultânea gera 409 e não sobrescreve em silêncio";
- toda escrita deixa um registro que ninguém altera nem apaga, e que pode ser exportado em CSV seguro para abrir no Excel;
- um `dotnet test` prova que:
  - o banco recusa alterar ou apagar a trilha até para o dono da tabela;
  - a obra de outra empresa responde 404 em toda rota;
  - uma falha da mudança ou da auditoria desfaz as duas.

## 02. Triagem
Confirmada por leitura da worktree `c12` (branch `feat/00012-identidade-empresas`), sem alterar nada.
- **T1 NÃO:** nenhum motor de cálculo. `data_status` só é guardada; reprogramar pela data de status é do 00015 e do 00016.
- **T2 NÃO:** os campos SINAPI (UF, regime e data-base) só são guardados. Nenhum preço nem quantidade.
- **T3 SIM:** formato novo de **exportação** em CSV (a trilha). Arquivo de exemplo fictício no §05. Sem MSPDI.
- **T4 NÃO:** `src/` não muda; o estado salvo do front fica intacto.
- **T5 SIM:**
  - dado pessoal na trilha: `usuario_id` (pseudônimo) e `motivo` (texto livre, onde alguém pode digitar dado pessoal);
  - entrada externa: corpo JSON e `opcoes_cronograma` (`jsonb` opaco);
  - CSV que sai do sistema (risco de injeção de fórmula).
- **T6 NÃO.**
- **T7 NÃO:** compose, Dockerfile, workflows e Dependabot não mudam. Nenhuma imagem nova.
- **T8 SIM:** 8 rotas novas, 4 tabelas, gatilhos, RLS, privilégios e migração. O `classificar-diff.mjs` marca T8 por `^(api|backend|server)\/`.

**Faixa 3.** Validadores: `arquiteto`, `dba`, `seguranca`, `testes` e auditoria independente (`revisor` em modo AUDITAR).

**`especialista-obra`:** a `faixa-3.md` o chama quando T3 = sim. Aqui o CSV só leva a trilha, sem número de obra nem MSPDI. **Proposta [opinião]:** dispensar. A decisão é do orquestrador no gate (seção 15).

## 03. Decisões de design
Legenda:
- **[doc]**: prática documentada, com link;
- **[opinião]**: escolha da equipe, discutível;
- **[exigência]**: requisito de SPEC, ADR ou decisão do gate (nada aqui é exigência regulatória);
- **conferir**: ponto de API que o dev confirma na versão 10.0.x antes de escrever, com teste.

### 3.1 Camadas e onde cada peça mora
Busquei equivalentes antes de propor peças novas: não há serviço de aplicação, interceptor de `SaveChanges`, escritor de CSV nem consulta paginada no `server/`. Os únicos padrões existentes são `ConsultasIdentidade` (consultas em `Dados`), o `ContextoSessaoInterceptor` (interceptor singleton em `Dados/Rls/`) e os endpoints em `Api/<Área>/`.

| Peça | Onde | Motivo |
|---|---|---|
| `Obra`, `RegistroAuditoria`, `UfReferencia`, `MunicipioReferencia`, `IAuditavel`, `CodigoMunicipioIbge`, constantes `RegimesSinapi`, `AcoesAuditoria` e `OrigensAuditoria` | `server/src/CronoAI.Dominio/` | Entidades com fábrica e validação, como `Empresa`. O Domínio continua sem pacote (`ArquiteturaTestes`) |
| Configurações EF, `AuditoriaInterceptor`, `ListaBrancaAuditoria`, `MetadadosEscrita`, `ConsultasAuditoria` | `server/src/CronoAI.Dados/` (`Configuracoes/`, `Auditoria/`) | O interceptor lê o `ChangeTracker`; é infraestrutura de dados [opinião] |
| `ServicoObras` (scoped), endpoints, contratos, mapeamento de erros | `server/src/CronoAI.Api/Obras/` | O fluxo carregar → comparar versão → aplicar → salvar → mapear exceção é regra de aplicação; o endpoint fica fino |
| Endpoints da trilha e `EscritorCsvAuditoria` (puro, testável sem banco) | `server/src/CronoAI.Api/Auditoria/` | O formato do arquivo é da borda HTTP |

Direção `Api → Dados → Dominio` mantida [exigência, ADR 00004].

### 3.2 Obra (RF-14.3, RF-01.1b)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Colunas do parecer §1.1 (tabela completa no §07): nome, UF, município IBGE, responsável, data de status, os 3 campos SINAPI, `opcoes_cronograma`, `versao`, `criada_em`, `atualizada_em` e `arquivada_em` | Incluir `data_inicio`, `calendario_id` e `premissas` da SPEC-01 §5 | As tabelas de calendário e premissas são do 00015; coluna órfã agora seria dívida. Vira emenda da SPEC-01 §5 no E4 [opinião do `dba`, acatada] |
| **"D" do CRUD = arquivar** (`arquivada_em`) e `REVOKE DELETE` em `obra`. Restaurar limpa `arquivada_em`. Os dois são auditados. Sem rota `DELETE` | Exclusão física | **Q1.** A auditoria referencia a obra por FK `Restrict` e é imutável: a exclusão física seria impossível. Exclusão definitiva, se um dia existir, é procedimento do Jurídico, nunca da API |
| O filtro global do EF **não** esconde a obra arquivada. A listagem a exclui por padrão (`?incluirArquivadas=true` a inclui). `GET /{id}` e a trilha leem a obra arquivada | Filtro global de arquivamento | O filtro global já é o de empresa; um segundo esconderia a obra da própria trilha [opinião do `dba`] |
| Obra arquivada é **somente leitura**: `PUT` responde 409 (`obra-arquivada`) com o estado atual | Permitir editar arquivada | O conflito é com o estado atual do recurso [doc: [RFC 9110 §15.5.10](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.10)] |
| **`responsavel_id`** nulo ou FK composta `(empresa_id, responsavel_id) → membro_empresa(empresa_id, usuario_id)`, `MATCH SIMPLE`, `Restrict`. Nunca texto livre | `responsavel_nome` texto (como na Fase 1) | **Q4.** O banco garante que o responsável é membro da mesma empresa. A FK ignora o RLS, então membro de outra empresa e usuário inexistente dão o **mesmo** 400 (não revela existência). Consequência para o 00014: remover membro que é responsável exige reatribuir antes (nota no ADR 00006) |
| **Nome único por empresa entre as obras não arquivadas:** índice único parcial `ux_obra_empresa_nome_ativa ON (empresa_id, lower(nome)) WHERE arquivada_em IS NULL`. Nome aparado nas pontas no domínio; diferença de acento conta (ICU pt-BR) | Sem unicidade | **Q5, opinião de produto, registrada como tal.** Arquivar libera o nome; restaurar com o nome ocupado responde 409 (`obra-nome-duplicado`). O "duplicar obra" (RF-14.1, fora do escopo) terá de gerar um nome novo. [doc: [índice parcial](https://www.postgresql.org/docs/current/indexes-partial.html), [índice por expressão](https://www.postgresql.org/docs/current/indexes-expressional.html)] |
| `data_status date NULL` (`DateOnly?`) | Obrigatória | **Q8** |
| SINAPI "tudo ou nada" (`ck_obra_sinapi_tudo_ou_nada`); regime `desonerado`/`nao_desonerado`; data-base no dia 1. **Fonte única:** `obra.sinapi_*`. O 00015 não pode duplicar esses campos nas premissas | Campos soltos | Parecer §1.1; SPEC-07 RF-07.3 |
| `opcoes_cronograma jsonb NOT NULL DEFAULT '{}'`: objeto, no máximo 16 KB (`CHECK` no banco), profundidade máxima de 16 na leitura da API. O servidor **não interpreta** o conteúdo neste ciclo | Tirar do 00013 | Está no PLANO §5.3. O conteúdo depende do tipo de projeto do front, que ainda muda na Fase 1; o 00015 o normaliza. Risco registrado: o front (00019) trata o conteúdo como dado, nunca como HTML ou instrução [opinião] |
| `empresa_id`, `id` e `criada_em` imutáveis no EF (`PropertySaveBehavior.Throw`); o `WITH CHECK` da política de UPDATE impede mover a obra de empresa | Confiar só no banco | Defesa em profundidade [opinião do `dba`] |
| Instantes (`criada_em`, `atualizada_em`, `auditoria.em`) vêm do `TimeProvider`, nunca de `now()` | `DEFAULT now()` | `RelogioTeste` nos testes; mesmo padrão da `sessao` |

### 3.3 Município e UF sem a lista oficial (Q3, Q7)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `uf_referencia(sigla, codigo_ibge, nome)` com **27 linhas semeadas pela migração**, por `migrationBuilder.InsertData` [doc: [EF data seeding](https://learn.microsoft.com/ef/core/modeling/data-seeding)]. Sem RLS, só `SELECT` para o `cronoai_app` | Prefixo validado só no domínio | **Q3, exceção registrada ao ADR 00004** ("seed só por comando" mira dado de desenvolvimento; aqui é dado nacional necessário à integridade). Os códigos ficam marcados **"conferir com a fonte oficial do IBGE antes do merge (pendência do usuário)"**. O `InsertData` não escreve `INSERT INTO` no C# e não aciona a R15, que existe por causa do RLS (a tabela não tem RLS) |
| `municipio_referencia(codigo_ibge, uf, nome)` **vazia**, sem RLS, só `SELECT` para a aplicação. Nos testes, um seed **fictício** (fixture, nunca migração) | Baixar a lista | **Q7.** Sem download; a lista oficial é insumo pendente do usuário |
| **Validação em camadas:**<br>1. banco: `CHECK ^[0-9]{7}$`;<br>2. banco: coluna gerada `municipio_uf_cod smallint` (os 2 primeiros dígitos, protegidos por `CASE`) + FK composta `(uf, municipio_uf_cod) → uf_referencia(sigla, codigo_ibge)`;<br>3. domínio: dígito verificador (pesos 1,2,1,2,1,2; soma dos algarismos de cada produto; `DV = (10 − soma mod 10) mod 10`) | Só formato | **Q7.** Barra erro de digitação sem a lista. [doc: [colunas geradas](https://www.postgresql.org/docs/current/ddl-generated-columns.html); **conferir** que o EF/Npgsql mapeia a coluna gerada como somente leitura (`HasComputedColumnSql(..., stored: true)`) e que a FK sobre coluna gerada é aceita. Plano B: FK por `migrationBuilder.Sql` com `ON DELETE RESTRICT` explícito] |
| **FK para `municipio_referencia`: NÃO é criada neste ciclo.** Nota do arquiteto sobre a Q7: uma FK `NOT VALID` deixa de checar só as linhas **existentes**; as linhas **novas** são checadas. Com a tabela vazia, ela recusaria toda obra nova. O ciclo da carga oficial faz, nesta ordem: carga → `ADD CONSTRAINT ... NOT VALID` → corrigir as obras fora da lista (`LEFT JOIN`) → `VALIDATE CONSTRAINT` [doc: [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)] | Criar a FK `NOT VALID` agora | É a leitura coerente da Q7. O teste T29 prova o procedimento numa tabela gêmea, em transação desfeita |
| A regra do DV fica numa função pura com conjunto de exceções **vazio** | DV sem saída de exceção | **Risco não verificado:** validadores de terceiros citam códigos oficiais que não seguem o DV. Não confirmei numa fonte oficial. Se a lista do IBGE confirmar, os códigos entram nesse conjunto (ciclo da carga) |

### 3.4 Concorrência otimista (Q2)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **`obra.versao bigint NOT NULL DEFAULT 1`**, incrementada pelo gatilho `BEFORE UPDATE FOR EACH ROW` (`NEW.versao := OLD.versao + 1`), que **ignora** o valor enviado. No EF: `IsConcurrencyToken()` + `ValueGeneratedOnAddOrUpdate()`, lida de volta por `RETURNING` (**conferir** por teste) | `xmin` (texto do PLANO E2) | **Q2.** Converge com o ADR 00004 ("contador explícito na `obra`... porque o `xmin` da obra não muda quando uma tarefa muda"). É estável em backup e restore e cobre o `PUT` em lote do 00015. [doc: [EF concorrência](https://learn.microsoft.com/ef/core/saving/concurrency), [Npgsql](https://www.npgsql.org/efcore/modeling/concurrency.html)] |
| **Fluxo da escrita** (`ServicoObras`):<br>1. carregar pelo `DbSet` filtrado; ausente → **404**;<br>2. comparar `versao` em memória; diferente → **409** com o estado carregado;<br>3. arquivada e `PUT` → 409 (`obra-arquivada`);<br>4. `entry.Property(Versao).OriginalValue = requisicao.Versao`; aplicar; salvar;<br>5. `DbUpdateConcurrencyException` → `GetDatabaseValuesAsync`: nulo → **404**; senão → **409** com o estado do banco | Ir direto ao UPDATE | Regra "carregar antes de atualizar" do ADR 00006: sob RLS, o UPDATE de outra empresa afeta 0 linhas e viraria 409, o que seria errado. Em READ COMMITTED, o 2º UPDATE concorrente reavalia o `WHERE`, afeta 0 linhas e o EF lança a exceção [doc: [isolamento](https://www.postgresql.org/docs/current/transaction-iso.html)]. Sem SERIALIZABLE |
| **Contrato:** `versao` (inteiro) **obrigatória no corpo** de `PUT`, `arquivar` e `restaurar`. Ausente → 400. `GET`, `POST` e `PUT` devolvem `versao`. Sem `If-Match`/`ETag` | `If-Match` + 412 | Falha de `If-Match` é 412 [doc: [RFC 9110 §13.1.1](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1)], e a SPEC-01 RF-01.4 pede 409 [exigência]. `ETag` de cortesia fica fora do escopo |
| **409 em ProblemDetails** ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)) com `type` = `conflito-de-versao`, `obra-arquivada` ou `obra-nome-duplicado` (código curto, como `empresa-ativa-necessaria`) e a extensão **`estadoAtual`** (a obra como está, com `versao`) nos dois primeiros | Só o status | RF-01.4 [exigência]. O `estadoAtual` só existe quando a obra é visível ao chamador: obra de outra empresa dá 404, **nunca 409** (Q2) |
| `PUT` sem nenhuma mudança: o EF não emite UPDATE; a versão não muda; nada é auditado; 200 com o estado | Forçar UPDATE | Evita trilha ruidosa e versão inflada [opinião] |
| Arquivar e restaurar por `POST .../arquivar` e `POST .../restaurar` com `{ versao, motivo? }` | `DELETE` com corpo | Corpo em `DELETE` tem semântica indefinida [doc: [RFC 9110 §9.3.5](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.5)] |
| `PUT` substitui a representação inteira (todos os campos editáveis + `versao` + `motivo?`) | `PATCH` parcial | O front envia o formulário inteiro; `PATCH` dobraria a validação [opinião] |

### 3.5 Auditoria append-only (RF-02.4, RF-02.5)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Tabela** do parecer §3.1, com dois cortes (Q6): **sem coluna `ip`** e `motivo` opcional. Colunas: `id bigint identity`, `empresa_id`, `obra_id`, `usuario_id`, `entidade`, `entidade_id`, `acao`, `antes`, `depois`, `versao_depois`, `origem`, `motivo`, `correlacao_id`, `em` | Coluna `ip` nula | **Q6, privacidade por padrão.** Uma coluna nula seria convite a preencher. Acrescentar coluna nula depois é uma migração barata. **Diverge do RF-02.4** ("IP"): fica registrado como cobertura parcial, com nota na SPEC-02 (E4) e pendência no Jurídico |
| **Três camadas independentes** (parecer §3.2):<br>1. `REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM cronoai_app`;<br>2. RLS `FORCE` só com políticas de SELECT e INSERT;<br>3. gatilho **de instrução** `BEFORE UPDATE OR DELETE OR TRUNCATE ... FOR EACH STATEMENT` com `RAISE EXCEPTION ... USING ERRCODE = 'restrict_violation'` e `ENABLE ALWAYS` | Só o `REVOKE` | Cada camada cobre o furo da outra: o gatilho de instrução dispara com 0 linhas, para o dono e para TRUNCATE; o `ENABLE ALWAYS` resiste a `session_replication_role = replica` [doc: [CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html), [privilégios](https://www.postgresql.org/docs/current/ddl-priv.html), [RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)] |
| **Limite declarado:** o dono pode fazer `DROP`/`DISABLE TRIGGER` e `DROP TABLE`, e o superusuário contorna tudo. "Inclusive para o dono" vale contra DML, não contra DDL. Mitigações: teste de catálogo (`tgenabled = 'A'`, privilégios, políticas), **R19** (alerta em migração que cita `auditoria` junto de `DISABLE`/`DROP TRIGGER`, `DROP POLICY`, `GRANT`, `NO FORCE`) e revisão humana de migração | Hash encadeado | Contra superusuário, só controle de fora do banco (Infra e Segurança). Hash encadeado: opinião, fora do escopo |
| **Gravação na mesma transação:** `AuditoriaInterceptor : SaveChangesInterceptor`, singleton, síncrono **e** assíncrono:<br>• no `SavingChanges`, chama `DetectChanges()` e percorre as entradas `IAuditavel`;<br>• adiciona os `RegistroAuditoria` **ao mesmo `DbContext`**: mesmo `SaveChanges`, mesmo lote, tudo ou nada.<br>[doc: [interceptores](https://learn.microsoft.com/ef/core/logging-events-diagnostics/interceptors), [transações](https://learn.microsoft.com/ef/core/saving/transactions)]. **Conferir** que as entradas adicionadas no `SavingChanges` entram no lote (provado por T30/T31) | Gatilho `AFTER` nas tabelas de negócio; outro `DbContext` | O gatilho não conhece origem, motivo nem correlação. Outro contexto seria outra conexão, outra transação e outro contexto de RLS [opinião do `dba`, acatada] |
| **Metadados obrigatórios (falha fechada):** `CronoDbContext.SalvarAuditadoAsync(MetadadosEscrita, ct)`, com o record imutável `MetadadosEscrita(Origem, Motivo?, CorrelacaoId?, InstanteUtc)`. Guarda os metadados só durante a chamada. Um `SaveChanges` comum com entrada `IAuditavel` **lança**. Entrada `IAuditavel` em estado `Deleted` **lança** | Metadados num serviço scoped mutável | Uma escrita auditável não sai sem quem e por quê. O `usuario_id` vem do `ContextoBanco` imutável (sessão), **nunca** do corpo; sem usuário, lança [opinião] |
| **Ação derivada:** `Added` → `criar`; `Modified` com `arquivada_em` de nulo para valor → `arquivar`; de valor para nulo → `restaurar`; senão → `alterar` | Ação informada pelo chamador | Menos superfície de erro; o domínio garante que arquivar só mexe em `arquivada_em`/`atualizada_em` [opinião] |
| **Lista branca por entidade** (`ListaBrancaAuditoria`), com as chaves do JSON = nomes das colunas (`snake_case`). Obra: `nome`, `uf`, `municipio_ibge`, `responsavel_id`, `data_status`, `sinapi_uf`, `sinapi_regime`, `sinapi_data_base`, `opcoes_cronograma`, `arquivada_em`. `antes` nulo em `criar`; em `alterar`, **só os campos alterados**. `versao` vai em `versao_depois`, não no JSON | Serializar a entidade inteira | Minimização e volume (lotes de 3.000 no 00015). Campo fora da lista é descartado (T32) |
| `versao_depois` = `versao` original + 1 (ou 1 em `criar`), conferida contra o banco (T34) | Omitir | Liga a trilha à versão do 409 |
| `origem = 'ui'` nas rotas com cookie de sessão. O `CHECK` aceita `ui`, `importacao`, `whatsapp` e `api` (RF-02.4); os outros valores entram no 00019 (importação), na Fase 3 (WhatsApp) e no 00022 (API de integração) | `api` para toda chamada HTTP | A origem descreve o canal de negócio, não o protocolo [opinião] |
| `correlacao_id uuid NULL` = `TraceId` W3C da requisição (128 bits) quando existir (**conferir** `Activity.Current` no ASP.NET Core 10); nulo caso contrário | Coluna `text` | Junta a trilha com os logs sem dado pessoal |
| `motivo` opcional, até 500 caracteres, sem `\0` (o PostgreSQL recusa NUL em `text`). A UI do 00019/00020 avisa para não digitar dado pessoal | Obrigatório | **Q6** |
| **Retenção, pseudonimização e exceção controlada ao append-only:** nada implementado. Pendência do **Jurídico** (e da Segurança para o procedimento) | Decidir agora | **Q6.** O `usuario_id` já permite pseudonimizar por `UPDATE` em `usuario` sem tocar a trilha |
| **Sem particionamento** | Particionar agora | O ADR 00004 já diz "não particionar agora". **Gatilho de reavaliação:** se o Jurídico exigir descarte por prazo antes do merge, o plano volta à etapa 3 e particiona no 00013 (PK `(id, em)`), porque converter depois exige cópia da tabela (parecer §3.6) |
| Ordenação por `(em, id)`; o identity não é monotônico por commit e tem buracos [doc: [sequências](https://www.postgresql.org/docs/current/functions-sequence.html)]. Paginação e exportação por keyset, nunca `OFFSET` | Ordenar por `id` | Parecer §3.1 |

### 3.6 Proibição de escrita fora do `SaveChanges` (R18) e alerta de migração (R19)
- **R18 (bloqueia)** em `server/src/**/*.cs`, dois casos:
  - `ExecuteUpdate`, `ExecuteUpdateAsync`, `ExecuteDelete` ou `ExecuteDeleteAsync` fora de `CronoAI.Dados/Identidade/ConsultasIdentidade.cs`, a lista permitida (só `sessao`, que não é auditada). A regra é por arquivo, e não por entidade, porque a cadeia LINQ quebra linhas e um teste de texto não descobre o tipo com segurança [opinião]. Esses métodos não passam pelo `ChangeTracker` nem pelo interceptor de `SaveChanges` [doc: [ExecuteUpdate/ExecuteDelete](https://learn.microsoft.com/ef/core/saving/execute-insert-update-delete)].
  - `ExecuteSql`/`SqlQuery`/`FromSql` numa linha que cite `cronoai.obra` ou `cronoai.auditoria` com `INSERT`, `UPDATE` ou `DELETE`, fora de `Migrations/`.
- **R19 (alerta)** em `server/src/CronoAI.Dados/Migrations/*.cs`: linha que cite `auditoria` com `DISABLE TRIGGER`, `DROP TRIGGER`, `DROP POLICY`, `ALTER POLICY`, `GRANT` ou `NO FORCE`. É alerta, e não bloqueio, porque o `Down()` legítimo remove a tabela. A revisão humana decide.
- **Testes de arquitetura em C#** complementam:
  - `DbSet<RegistroAuditoria>` só recebe `Add`/`AddRange` e leitura em `ConsultasAuditoria`;
  - nenhum arquivo que use `ExecuteUpdate`/`ExecuteDelete` referencia `Obra` ou `RegistroAuditoria`;
  - toda `IAuditavel` tem lista branca;
  - toda entidade gravável de empresa é `IAuditavel` ou está na lista declarada de exceções: `MembroEmpresa`, `Sessao` e `Empresa`, até o 00014.
- O gatilho de `versao` incrementa mesmo por caminho que fuja do EF; a auditoria não. Por isso a R18 bloqueia.

### 3.7 API de obras
| Rota | Política | Antiforgery | Cenário de isolamento | Respostas |
|---|---|---|---|---|
| `GET /api/v1/obras?incluirArquivadas=` | `EmpresaAtiva` | — | `SemRecurso` | 200, 401, 403 |
| `POST /api/v1/obras` | `EmpresaAtiva` | sim | `SemRecurso` (+ T48: `responsavelId` da empresa B dá 400) | 201 + `Location`, 400, 401, 403, 409 (`obra-nome-duplicado`), 413 |
| `GET /api/v1/obras/{id}` | `EmpresaAtiva` | — | `ComIdDeOutraEmpresa` | 200, 401, 403, 404 |
| `PUT /api/v1/obras/{id}` | `EmpresaAtiva` | sim | `ComIdDeOutraEmpresa` | 200, 400, 401, 403, 404, 409, 413 |
| `POST /api/v1/obras/{id}/arquivar` | `EmpresaAtiva` | sim | `ComIdDeOutraEmpresa` | 200, 400, 401, 403, 404, 409 |
| `POST /api/v1/obras/{id}/restaurar` | `EmpresaAtiva` | sim | `ComIdDeOutraEmpresa` | 200, 400, 401, 403, 404, 409 |
| `GET /api/v1/obras/{id}/auditoria?cursor=&limite=` | `EmpresaAtiva` | — | `ComIdDeOutraEmpresa` | 200, 400, 401, 403, 404 |
| `GET /api/v1/auditoria/exportacao.csv?de=&ate=&obraId=` | `EmpresaAtiva` + limite `exportacao` | — | `SemRecurso` (+ T74: `obraId` da empresa B dá 404) | 200 `text/csv`, 400, 401, 403, 404, 429 |

- **Contratos** (um tipo por arquivo, em português):
  - `ObraResposta`: `id`, `nome`, `uf`, `municipioIbge`, `responsavelId`, `dataStatus`, `sinapi { uf, regime, dataBase } | null`, `opcoesCronograma`, `versao`, `criadaEm`, `atualizadaEm`, `arquivadaEm`;
  - `CriarObraRequisicao`;
  - `AtualizarObraRequisicao` (o mesmo + `versao` obrigatória);
  - `MudancaArquivamentoRequisicao { versao, motivo? }`;
  - `RegistroAuditoriaResposta`, `PaginaAuditoria { itens, proximoCursor }`.
- **Atribuição em massa:** o contrato não tem `empresaId`, `id`, `criadaEm` nem `atualizadaEm`. Um `empresaId` enviado no corpo é ignorado e a obra nasce na empresa da sessão (T46) [doc: [OWASP Mass Assignment](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html)].
- **Erros de validação** em `ValidationProblem` (400), com a chave do campo:
  - validação do domínio primeiro;
  - violação do banco mapeada pelo **nome da constraint** (`PostgresException.ConstraintName`) para o campo: `fk_obra_uf` → `uf`; `fk_obra_municipio_uf` → `municipioIbge`; `fk_obra_responsavel` → `responsavelId`; `fk_obra_sinapi_uf` → `sinapi.uf`; `ck_obra_*` → o campo;
  - `ux_obra_empresa_nome_ativa` → 409 `obra-nome-duplicado`;
  - nenhuma mensagem do PostgreSQL vai ao cliente;
  - constraint não mapeada → 500 genérico, com log sem dado.
- **Limite de corpo de 64 KB** nas escritas de obra → 413 [opinião; **conferir** `IRequestSizeLimitMetadata` em minimal APIs; doc: [limites do Kestrel](https://learn.microsoft.com/aspnet/core/fundamentals/servers/kestrel/options)].
- **Até o 00014, todo membro da empresa ativa tem todas as ações em obras.** A SPEC-02 §3 restringe "criar obras" ao administrador; o 00014 aplica a matriz. Fica registrado como risco aceito, só local.
- Listagem sem paginação. Dezenas a centenas de obras por empresa; reavaliar acima de 500 [opinião].

### 3.8 Leitura e exportação da trilha
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `GET /obras/{id}/auditoria`:<br>• ordem `(em DESC, id DESC)`;<br>• cursor opaco (base64url de `em` + `id`), validado com rigor; inválido → 400;<br>• `limite` de 1 a 200, padrão 50 | `OFFSET` | Keyset é estável sob inserção [opinião do `dba`] |
| A resposta e o CSV levam **`usuario_id`, sem nome** | `JOIN usuario` para o nome | O acesso a `DbSet<Usuario>` é restrito a `ConsultasIdentidade` (ADR 00006). O nome é dado pessoal e o arquivo sai do sistema. O front resolve nomes pela lista de membros (00014). Mostrar o autor no registro de decisões (critério da SPEC-02) entra no 00014/00020 [opinião, privacidade por padrão] |
| **CSV:**<br>• UTF-8 com BOM, separador `;`, `CRLF`;<br>• todo campo entre aspas, com `"` duplicado;<br>• cabeçalho fixo (§05);<br>• `Content-Disposition: attachment; filename="auditoria-AAAAMMDD.csv"`, nome sem entrada do usuário | `,` (RFC 4180 puro) | O separador `;` segue a convenção do front (`sinapiBudget.ts:139`) e o Excel pt-BR. O resto segue a [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) [opinião] |
| **Neutralização:** toda célula que começa com `=`, `+`, `-`, `@`, **TAB (0x09) ou CR (0x0D)** ganha o prefixo `'`. Vale para todas as células de texto (`motivo`, `antes`, `depois`, `entidade`...), sem exceção | Só os 4 caracteres do PLANO | [doc: [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection)]. Pedido explícito deste ciclo. Teste com controle negativo (célula comum intacta) |
| **Filtros:** `de` e `ate` obrigatórios (datas, intervalo UTC `[de 00:00Z, ate+1 00:00Z)`), no máximo 366 dias; `obraId` opcional (obra invisível → 404). Leitura em páginas por keyset de `id` (1.000 linhas, configurável no teste), com escrita em fluxo na resposta, `AsNoTracking` | Exportar tudo | Limita custo e memória [opinião] |
| **Limite de taxa `exportacao`:** padrão 10/min por IP, 429 com `Retry-After` | Sem limite | RF-12.5; padrão do 00012 [doc: [rate limiting](https://learn.microsoft.com/aspnet/core/performance/rate-limit)] |
| Escritor de CSV próprio (cerca de 60 linhas), sem pacote | CsvHelper | Sem dependência nova, sem revisão de licença [opinião] |

### 3.9 Teste genérico de isolamento estendido
- `EntradaCatalogo` ganha o recurso alheio a usar no caminho. `DetectorDeRotas.Concretizar(padrao, recursos)` troca `{id}` pelo id de uma **obra real da empresa B**, criada no teste como `cronoai_app` com o contexto de B.
- **Meta-teste T77:** a concretização usa uma obra que existe e é de B. É o controle negativo: com um id aleatório, o 404 viria por "não existir" e o teste passaria sem provar nada.
- **Marcadores de vazamento:** o nome da obra de B (token aleatório), o id da empresa B e o id do usuário de B. **Não** o id da obra: ele está na URL e pode aparecer no ProblemDetails sem que haja vazamento.
- As escritas novas caem automaticamente em `Toda_escrita_exige_antiforgery`.

## 04. Caso de referência (T1/T2)
Não se aplica — sem cálculo.

## 05. MS Project e arquivos (T3)
Sem MSPDI. Formato novo: **CSV de exportação da trilha** (só saída; não há importação de CSV neste ciclo).

**Arquivo de exemplo (fictício).** É o conteúdo esperado do teste T71, com BOM no início, `;` como separador e `CRLF`. Os ids são inventados:
```
"id";"em_utc";"obra_id";"usuario_id";"entidade";"entidade_id";"acao";"origem";"versao_depois";"motivo";"antes";"depois";"correlacao_id"
"101";"2026-10-25T13:45:00Z";"0192f0a1-0000-7000-8000-000000000001";"0192f0a1-0000-7000-8000-0000000000aa";"obra";"0192f0a1-0000-7000-8000-000000000001";"criar";"ui";"1";"";"";"{""nome"":""Obra Ficticia Alfa"",""uf"":""PE"",""municipio_ibge"":""2699999""}";"4bf92f35-77b3-4da6-a3ce-929d0e0e4736"
"102";"2026-10-25T14:02:10Z";"0192f0a1-0000-7000-8000-000000000001";"0192f0a1-0000-7000-8000-0000000000aa";"obra";"0192f0a1-0000-7000-8000-000000000001";"alterar";"ui";"2";"'=HYPERLINK(""http://exemplo.invalid"")";"{""nome"":""Obra Ficticia Alfa""}";"{""nome"":""Obra Ficticia Alfa 2""}";""
```
- A linha 102 mostra a neutralização: o motivo começava com `=` e saiu com `'`.
- O comportamento esperado no Excel pt-BR: abre em colunas e nenhuma célula é avaliada como fórmula. A conferência manual no Excel é a V-2 (opcional).
- **Limite de tamanho:** a exportação é limitada pelo período (366 dias) e escrita em fluxo; não há arquivo de entrada.

## 06. Estado salvo (T4)
Não se aplica — `src/` não muda.

## 07. Dados (T8 com banco)
Parecer do `dba`: **`00013-tarefa0-dba.md`, `VEREDITO: AJUSTAR`, ajustes aplicados** (seção 16). Migração única: **`ObrasAuditoria`**.

### 07.1 Tabelas
`E` = `MigrationBuilderRlsExtensoes.ExpressaoEmpresa`. Schema `cronoai`, `snake_case`, constraints nomeadas à mão (até 63 bytes).

| Tabela | Colunas (tipo, nulidade) | Chaves e restrições | RLS |
|---|---|---|---|
| `uf_referencia` | `sigla text NOT NULL`<br>`codigo_ibge smallint NOT NULL`<br>`nome text NOT NULL` | PK `pk_uf_referencia (sigla)`; `CHECK ck_uf_referencia_sigla (sigla ~ '^[A-Z]{2}$')`; `UNIQUE ux_uf_referencia_sigla_codigo (sigla, codigo_ibge)` (alvo da FK composta); `UNIQUE ux_uf_referencia_codigo (codigo_ibge)` | Não (lista global) |
| `municipio_referencia` | `codigo_ibge text NOT NULL`<br>`uf text NOT NULL`<br>`nome text NOT NULL` | PK `(codigo_ibge)`; `CHECK ~ '^[0-9]{7}$'`; FK `uf → uf_referencia(sigla)` `Restrict`; `UNIQUE ux_municipio_referencia_codigo_uf (codigo_ibge, uf)` (alvo da FK futura) | Não (lista global) |
| `obra` | `id uuid NOT NULL` (v7, `ValueGeneratedNever`)<br>`empresa_id uuid NOT NULL`<br>`nome text NOT NULL`<br>`uf text NOT NULL`<br>`municipio_ibge text NOT NULL`<br>`municipio_uf_cod smallint` **gerada** `STORED`: `CASE WHEN municipio_ibge ~ '^[0-9]{7}$' THEN substr(municipio_ibge,1,2)::smallint END`<br>`responsavel_id uuid NULL`<br>`data_status date NULL`<br>`sinapi_uf text NULL`<br>`sinapi_regime text NULL`<br>`sinapi_data_base date NULL`<br>`opcoes_cronograma jsonb NOT NULL DEFAULT '{}'`<br>`versao bigint NOT NULL DEFAULT 1`<br>`criada_em timestamptz NOT NULL`<br>`atualizada_em timestamptz NOT NULL`<br>`arquivada_em timestamptz NULL` | PK `pk_obra (id)`<br>`UNIQUE ux_obra_empresa_id_id (empresa_id, id)`<br>FK `fk_obra_empresa → empresa(id)`<br>FK `fk_obra_uf → uf_referencia(sigla)`<br>FK `fk_obra_sinapi_uf → uf_referencia(sigla)`<br>FK `fk_obra_municipio_uf (uf, municipio_uf_cod) → uf_referencia(sigla, codigo_ibge)`<br>FK `fk_obra_responsavel (empresa_id, responsavel_id) → membro_empresa(empresa_id, usuario_id)` `MATCH SIMPLE`<br>(todas `Restrict`)<br>`CHECK`s: `ck_obra_nome_tamanho` (1 a 200); `ck_obra_municipio_formato` (`^[0-9]{7}$`); `ck_obra_sinapi_regime` (`IN ('desonerado','nao_desonerado')`); `ck_obra_sinapi_data_base_dia_1`; `ck_obra_sinapi_tudo_ou_nada`; `ck_obra_opcoes_objeto` (`jsonb_typeof = 'object'`); `ck_obra_opcoes_tamanho` (`octet_length(opcoes_cronograma::text) <= 16384`); `ck_obra_versao_positiva` (`>= 1`); `ck_obra_atualizada_apos_criada`; `ck_obra_arquivada_apos_criada`<br>Índice único parcial `ux_obra_empresa_nome_ativa ON (empresa_id, lower(nome)) WHERE arquivada_em IS NULL` (por `migrationBuilder.Sql`: o EF não expressa índice por expressão; **conferir** que o `has-pending-model-changes` continua limpo) | Sim, `FORCE` |
| `auditoria` | `id bigint GENERATED ALWAYS AS IDENTITY`<br>`empresa_id uuid NOT NULL`<br>`obra_id uuid NULL`<br>`usuario_id uuid NOT NULL`<br>`entidade text NOT NULL`<br>`entidade_id uuid NOT NULL`<br>`acao text NOT NULL`<br>`antes jsonb NULL`<br>`depois jsonb NULL`<br>`versao_depois bigint NULL`<br>`origem text NOT NULL`<br>`motivo text NULL`<br>`correlacao_id uuid NULL`<br>`em timestamptz NOT NULL`<br>**sem `ip`** (Q6) | PK `pk_auditoria (id)`<br>FK `fk_auditoria_obra (empresa_id, obra_id) → obra(empresa_id, id)` `MATCH SIMPLE`<br>FK `fk_auditoria_usuario → usuario(id)`<br>(todas `Restrict`)<br>`CHECK`s: `ck_auditoria_entidade` (`^[a-z_]{1,64}$`); `ck_auditoria_acao` (`IN ('criar','alterar','arquivar','restaurar')`); `ck_auditoria_origem` (`IN ('ui','importacao','whatsapp','api')`); `ck_auditoria_motivo_tamanho` (`<= 500`); `ck_auditoria_antes_objeto`/`ck_auditoria_depois_objeto` (`jsonb_typeof = 'object'`); `ck_auditoria_antes_tamanho`/`ck_auditoria_depois_tamanho` (`<= 262144`) | Sim, `FORCE` |

- Uma chave composta de entidade do 00015 (ex.: `vinculo`) vai precisar de id substituto, porque `entidade_id` é `uuid`. Aviso no ADR novo.
- Os índices de FK criados pela convenção do EF (`uf`, `sinapi_uf`, `(empresa_id, responsavel_id)`, `usuario_id`) são aceitos [opinião]: custo desprezível, e o de `(empresa_id, responsavel_id)` serve à reatribuição do 00014. O `dba` decide na revisão.

### 07.2 Privilégios, políticas e gatilhos (migração `ObrasAuditoria`)
| Tabela | Privilégios do `cronoai_app` | Políticas (todas `TO cronoai_app`, pelo helper) | Gatilhos |
|---|---|---|---|
| `uf_referencia`, `municipio_referencia` | só SELECT: `REVOKE INSERT, UPDATE, DELETE` | — | — |
| `obra` | SELECT, INSERT, UPDATE: `REVOKE DELETE` | `pol_obra_select USING (empresa_id = E)`; `pol_obra_insert WITH CHECK (empresa_id = E)`; `pol_obra_update USING (empresa_id = E) WITH CHECK (empresa_id = E)` | `trg_obra_versao BEFORE UPDATE FOR EACH ROW` → `cronoai.obra_incrementa_versao()` (`plpgsql`, `SET search_path = pg_catalog`) |
| `auditoria` | SELECT, INSERT: `REVOKE UPDATE, DELETE, TRUNCATE` (explícito, mesmo sem o TRUNCATE padrão). Sem `TRIGGER` nem `REFERENCES`. O `INSERT` no identity usa o `USAGE` padrão da sequência (**conferir** por T14) | `pol_auditoria_select USING (empresa_id = E)`; `pol_auditoria_insert WITH CHECK (empresa_id = E)`. **Nada mais** | `trg_auditoria_append_only BEFORE UPDATE OR DELETE OR TRUNCATE FOR EACH STATEMENT` → `cronoai.auditoria_recusa_alteracao()` (`RAISE EXCEPTION 'auditoria é append-only' USING ERRCODE = 'restrict_violation'`), seguido de `ALTER TABLE ... ENABLE ALWAYS TRIGGER` |

- O `Down()` remove gatilhos, funções, índice parcial e tabelas, na ordem inversa. `DROP TABLE` é DDL e o gatilho de instrução não o impede: é o limite declarado.
- **Sem migração de dados.** A semente das UFs usa `InsertData` em tabela sem RLS (exceção Q3).
- A `CatalogoTestes._tabelasForaDoRls` passa a ter `uf_referencia` e `municipio_referencia` (X2).

### 07.3 Índices (app DB)
- `obra`:
  - PK;
  - `ux_obra_empresa_id_id`, que cobre as FKs compostas e a listagem por empresa;
  - `ux_obra_empresa_nome_ativa`;
  - os índices de FK da convenção.
- `auditoria`:
  - PK;
  - `ix_auditoria_empresa_em (empresa_id, em DESC, id DESC)`, para a exportação e a listagem da empresa;
  - `ix_auditoria_empresa_obra_em (empresa_id, obra_id, em DESC, id DESC)`, para a trilha da obra (cobre a FK composta pelo prefixo; **conferir** que o EF não cria um índice redundante);
  - `usuario_id` (convenção).
- Nada mais antes de medir. `(empresa_id, entidade, entidade_id, em DESC)` espera o 00015. Sem GIN em `jsonb`.

### 07.4 Semente das 27 UFs (Q3)
**Conferir com a fonte oficial do IBGE antes do merge (pendência do usuário).** Os códigos abaixo vêm do parecer do `dba`, que os conhece de memória e **não os verificou** numa fonte oficial. Eu também não os verifiquei.

| Sigla | Código | Nome | Sigla | Código | Nome | Sigla | Código | Nome |
|---|---|---|---|---|---|---|---|---|
| RO | 11 | Rondônia | PI | 22 | Piauí | MG | 31 | Minas Gerais |
| AC | 12 | Acre | CE | 23 | Ceará | ES | 32 | Espírito Santo |
| AM | 13 | Amazonas | RN | 24 | Rio Grande do Norte | RJ | 33 | Rio de Janeiro |
| RR | 14 | Roraima | PB | 25 | Paraíba | SP | 35 | São Paulo |
| PA | 15 | Pará | PE | 26 | Pernambuco | PR | 41 | Paraná |
| AP | 16 | Amapá | AL | 27 | Alagoas | SC | 42 | Santa Catarina |
| TO | 17 | Tocantins | SE | 28 | Sergipe | RS | 43 | Rio Grande do Sul |
| MA | 21 | Maranhão | BA | 29 | Bahia | MS | 50 | Mato Grosso do Sul |
| | | | | | | MT | 51 | Mato Grosso |
| | | | | | | GO | 52 | Goiás |
| | | | | | | DF | 53 | Distrito Federal |

- **Seed de teste (fixture):** `municipio_referencia` recebe `2699999` (UF `PE`, nome `MUNICIPIO TESTE A`). O DV 9 foi recalculado pela fórmula: 2·1 = 2; 6·2 = 12 → 3; 9·1 = 9; 9·2 = 18 → 9; 9·1 = 9; 9·2 = 18 → 9; soma 41; DV = (10 − 1) mod 10 = 9. Nenhum nome real na fixture.
- **Casos do DV nos testes de domínio** (fixam a fórmula; o usuário confere contra a lista oficial): `3550308`, `2611606` e `5300108` (DV 8, 6 e 8, conferidos à mão pelo `dba` e por mim); `2699999` (fictício).

### 07.5 Consultas previstas
Todas pelo EF (LINQ), sem SQL de escrita fora do `SaveChanges`:
- listagem de obras por empresa, com o filtro de arquivamento;
- obra por id (filtrada);
- trilha por obra com keyset `(em, id)`;
- exportação por empresa e período com keyset de `id`.

## 08. Segurança
**Superfície nova:**
- 8 rotas autenticadas, 4 delas de escrita;
- corpo JSON com `jsonb` opaco;
- arquivo CSV que sai do sistema;
- tabela com dado pessoal pseudonimizado (`usuario_id`) e texto livre (`motivo`);
- gatilhos e funções no banco.

| Ameaça | Mitigação | Teste |
|---|---|---|
| IDOR / obra de outra empresa | Empresa da sessão; filtro do EF; RLS `FORCE`; carregar antes de atualizar; 404 idêntico; `{id}` real de B no teste genérico | T13, T51, T55, T74, T77, X5 |
| Adulteração ou apagamento da trilha | `REVOKE` + RLS só SELECT/INSERT + gatilho de instrução `ENABLE ALWAYS`; R18; R19 | T16 a T19, T78, T79 |
| Escrita sem auditoria | Interceptor na mesma transação; metadados obrigatórios; R18; teste "toda rota de escrita audita" | T30 a T36, T41, T67 |
| Sobrescrita silenciosa (atualização perdida) | `versao` por gatilho + token de concorrência + 409 | T21 a T23, T54, T58 |
| Atribuição em massa (`empresaId`, `versao`, `id`) | Contrato sem esses campos; gatilho ignora a `versao` enviada | T21, T46 |
| Injeção de fórmula no CSV | Prefixo `'` em `= + - @ TAB CR`; aspas em todo campo | T06, T07, T72 |
| SQL injection | Só EF/LINQ; R14 vigente; `FromSql` interpolado | R14 (existente) |
| DoS por corpo grande ou exportação enorme | 64 KB nas escritas; 16 KB em `opcoes_cronograma`; teto de 366 dias; keyset em fluxo; limite de taxa | T49, T24, T73, T75, T76 |
| Vazamento de detalhe interno no erro | Mapeamento por nome de constraint; nunca a mensagem do PostgreSQL; 500 genérico | T47, T48 |
| Dado pessoal em log ou na trilha | Logs só com ids; sem IP; sem nome/e-mail/emissor/sujeito na trilha; lista branca | T37, T66, T70 |
| Teste que passa por engano | Banco como `cronoai_app`; gêmea sem gatilho como controle; meta-teste da concretização | T17, T18, T77 |

- **Dependências novas:** nenhuma (sem pacote, sem imagem).
- **ASVS 5.0.0** (numeração dos itens a conferir na tag `v5.0.0`; nenhum número inventado):
  - **V1:** CSV com neutralização;
  - **V2:** validação de tipo, tamanho e formato e regra de negócio (versão, arquivamento, unicidade);
  - **V4:** 409/404/400/413 em ProblemDetails;
  - **V8:** isolamento por obra, com `{id}` real no teste;
  - **V14:** minimização na trilha, sem IP;
  - **V16:** trilha append-only, logs sem dado pessoal.

## 09. Entregáveis
Commits em Conventional Commits, em português, terminando com a linha exata `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, só com aprovação do usuário.

| # | Entregável | Fronteira | Critérios de aceite | Commit |
|---|---|---|---|---|
| E1 | Domínio e dados:<br>• entidades e `CodigoMunicipioIbge`;<br>• configurações;<br>• `AuditoriaInterceptor`, `ListaBrancaAuditoria`, `MetadadosEscrita`, `SalvarAuditadoAsync`;<br>• migração `ObrasAuditoria`;<br>• testes de domínio, banco e arquitetura | `server/src/CronoAI.Dominio/**`, `server/src/CronoAI.Dados/**`, `server/tests/.../{Dominio,Dados}/**`, `ArquiteturaTestes.cs`, `MigracoesTestes.cs`, `Infra/DadosTeste.cs` | AC-2 a AC-6, AC-8 (banco), AC-9, AC-10 (banco), AC-11 (banco), AC-19, R-1 a R-3 | `feat(server): obras, trilha de auditoria append-only e versão por gatilho (ciclo 00013, E1)` |
| E2 | API de obras:<br>• `ServicoObras`, endpoints e contratos;<br>• mapeamento 400/404/409/413;<br>• limite de corpo;<br>• catálogo de isolamento com `{id}` real;<br>• OpenAPI regenerado | `server/src/CronoAI.Api/Obras/**`, `Program.cs`, `server/openapi/CronoAI.Api.json`, `server/tests/.../Obras/**`, `Isolamento/**` | AC-1, AC-6 a AC-8, AC-10 a AC-13, AC-20, S-1 a S-4, S-6, S-7 | `feat(server): CRUD de obras com arquivamento, versão e 409 com o estado atual (ciclo 00013, E2)` |
| E3 | Trilha:<br>• `ConsultasAuditoria`;<br>• `GET /obras/{id}/auditoria`;<br>• exportação CSV com neutralização;<br>• limite `exportacao` | `server/src/CronoAI.Dados/Auditoria/ConsultasAuditoria.cs`, `server/src/CronoAI.Api/Auditoria/**`, `Borda/BordaExtensoes.cs`, `Borda/OpcoesBorda.cs`, `appsettings.json`, `server/openapi/CronoAI.Api.json`, `server/tests/.../Auditoria/**`, `CatalogoRotas.cs` | AC-13 (exportação), AC-14, AC-15, S-5 | `feat(server): leitura e exportação CSV da trilha com neutralização de fórmulas (ciclo 00013, E3)` |
| E4 | Processo e documentação:<br>• R18, R19 e testes;<br>• ADR 00009 (novo);<br>• ajustes nos ADRs 00004 e 00006;<br>• `backend-dotnet.md`, checklist ASVS;<br>• emendas SPEC-01 §5 e SPEC-02 RF-02.4;<br>• `CLAUDE.md`, `server/README.md` | `.claude/scripts/lib/regras-cronoai.mjs`, `regras-cronoai.test.mjs`, `.claude/adrs/**`, `.claude/rules/backend-dotnet.md`, `.claude/checklists/seguranca.md`, `docs/specs/SPEC-01-arquitetura-backend.md`, `docs/specs/SPEC-02-identidade-perfis-auditoria.md`, `CLAUDE.md`, `server/README.md` | AC-16, AC-17 | `docs(processo): ADR da trilha append-only e da concorrência, regras R18 e R19 (ciclo 00013, E4)` |

Cerca de 65 arquivos, dos quais ~4 gerados (migração, designer, snapshot, OpenAPI). Cada entregável passa sozinho em `dotnet build -c Release`, `dotnet test` e `npm run ci`. Dependências entre entregáveis:
- o E2 depende do E1;
- o E3 depende do E2 (catálogo e contratos);
- o E4 corre em paralelo depois do E1 (a R18 precisa saber dos nomes finais).

### Proposta de divisão (contingência)
O ciclo está no **limite de um M/G** (estimativa: igual ao 00012 em arquivos e tarefas). Opções:

| Opção | Recorte | Avaliação |
|---|---|---|
| **A — recomendada [opinião]:** um ciclo, 4 entregáveis, com **linha de corte no E3** | Se, no checkpoint depois do E2, o esforço passar de ~1,5× o previsto, o E3 vira o ciclo **00013b** com os mesmos AC-14 e AC-15, e o PLANO-FASE-2 ganha a linha | Mantém juntos obra, versão e auditoria, que precisam nascer juntos. O E3 é a única fronteira que não deixa escrita sem garantia |
| B | 00013 = obras + concorrência; 00013b = auditoria + CSV | **Descartada:** a obra seria gravada sem auditoria, contra o RF-02.4 e o PLANO §8.2 ("auditoria gravada na mesma transação"), e o interceptor entraria depois com as rotas já prontas |
| C | 00013 = só banco (E1); 00013b = API + trilha | **Descartada:** o E1 sozinho não entrega nada usável e adia a prova do 409 pela API (critério da SPEC-01) |

**Recomendação:** não dividir de saída. Se precisar dividir, a divisão recomendada é **"E3 vira 00013b"** (variante da Opção A).

## 10. Tarefas
Cada tarefa leva até ~20 minutos de agente, salvo a migração.

| # | E | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 0 | — | **Feita:** levantamento do modelo. `00013-tarefa0-dba.md`, `VEREDITO: AJUSTAR`, ajustes aplicados (seção 16) | dba (leitura) | — | — |
| 1 | E1 | Domínio, parte 1:<br>• `CodigoMunicipioIbge` (formato + DV, conjunto de exceções vazio);<br>• constantes `RegimesSinapi`, `AcoesAuditoria`, `OrigensAuditoria`;<br>• `UfReferencia` e `MunicipioReferencia` (somente leitura);<br>• `IAuditavel { Guid Id }` | dev-backend | `server/src/CronoAI.Dominio/*.cs` | gate |
| 2 | E1 | Domínio, parte 2:<br>• `Obra : IDadoDeEmpresa, IAuditavel`, com as fábricas `Criar`, `Alterar`, `Arquivar` e `Restaurar` (validação do §3.2; nome aparado; sem `\0`; instante UTC);<br>• `RegistroAuditoria : IDadoDeEmpresa` (fábrica interna para o interceptor) | dev-backend | `Obra.cs`, `RegistroAuditoria.cs` | 1 |
| 3 | E1 | Configurações EF (§07.1):<br>• tipos, `CHECK`s e nomes;<br>• coluna gerada;<br>• FKs compostas na ordem da PK alvo;<br>• chave alternativa de `uf_referencia`;<br>• `IsConcurrencyToken` + `ValueGeneratedOnAddOrUpdate` em `Versao`;<br>• `PropertySaveBehavior.Throw` em `Id`, `EmpresaId` e `CriadaEm`;<br>• índices descendentes da auditoria.<br>`DbSet`s em `CronoDbContext` | dev-backend | `Configuracoes/{Obra,Auditoria,UfReferencia,MunicipioReferencia}Configuracao.cs`, `CronoDbContext.cs` | 2 |
| 4 | E1 | `MetadadosEscrita`, `ListaBrancaAuditoria`, `AuditoriaInterceptor` (síncrono e assíncrono; `DetectChanges`; lança sem metadados e em `Deleted`; ação derivada; diff só da lista branca; `versao_depois`) e `CronoDbContext.SalvarAuditadoAsync`. Registro em `CronoDbContextConfiguracao` | dev-backend | `Auditoria/*.cs`, `CronoDbContext.cs`, `CronoDbContextConfiguracao.cs` | 3 |
| 5 | E1 | `dotnet ef migrations add ObrasAuditoria` (string do migrador). À mão, na migração:<br>• `InsertData` das 27 UFs;<br>• índice único parcial;<br>• funções e gatilhos com `ENABLE ALWAYS`;<br>• os `REVOKE` do §07.2;<br>• RLS pelo helper;<br>• `Down()` completo.<br>`has-pending-model-changes` limpo | dev-backend | `Migrations/*_ObrasAuditoria*.cs`, snapshot | 4 |
| — | E1 | **Checkpoint:** o orquestrador confere a migração contra o §07: `REVOKE`, políticas, `FORCE`, gatilhos (`FOR EACH STATEMENT`, `ENABLE ALWAYS`), `CHECK`s, FKs compostas, índice parcial, 27 linhas e `Down()` | orquestrador | — | 5 |
| 6 | E1 | Testes de domínio (T01 a T05, T08) e `DadosTeste.CriarObraAsync`/`SemearMunicipioFicticioAsync` | dev-backend | `server/tests/.../Dominio/*.cs`, `Infra/DadosTeste.cs` | 2 |
| 7 | E1 | Testes de banco: catálogo, RLS e append-only (T10 a T20, T29, T37; X1 a X4, X6) | dev-backend | `Dados/{ReferenciasTestes,RlsObraAuditoriaTestes,AppendOnlyTestes,CatalogoTestes,PrivilegiosIdentidadeTestes,RlsTestes}.cs`, `MigracoesTestes.cs` | 5, 6 |
| 8 | E1 | Testes de banco: versão, validações, unicidade e atomicidade (T21 a T28, T30 a T36) e de arquitetura (T40 a T44) | dev-backend | `Dados/{VersaoObraTestes,RestricoesObraTestes,AuditoriaInterceptorTestes}.cs`, `ArquiteturaTestes.cs` | 5, 6 |
| 9 | E2 | Contratos e `MapeadorErrosObra` (domínio → `ValidationProblem`; `PostgresException.ConstraintName` → campo; 23505 do índice parcial → 409) | dev-backend | `Obras/*Requisicao.cs`, `Obras/ObraResposta.cs`, `Obras/SinapiObra.cs`, `Obras/MapeadorErrosObra.cs` | E1 |
| 10 | E2 | `ServicoObras` (scoped): fluxo do §3.4; `MetadadosEscrita` com origem `ui`, `TraceId` e `TimeProvider`; resultado discriminado (ok, 404, 409 com estado, 400) | dev-backend | `Obras/ServicoObras.cs`, `Obras/ResultadoEscritaObra.cs` | 9 |
| 11 | E2 | `ObrasEndpoints`: 6 rotas com `TypedResults`, `RequireAuthorization(PoliticaEmpresaAtiva)`, `.ProducesProblem`, limite de 64 KB; `api.MapearObras()` no `Program.cs`; OpenAPI regerado | dev-backend | `Obras/ObrasEndpoints.cs`, `Program.cs`, `server/openapi/CronoAI.Api.json` | 10 |
| 12 | E2 | Testes de serviço com corrida (T38, T39) | dev-backend | `Obras/ServicoObrasCorridaTestes.cs` | 10 |
| 13 | E2 | Testes de API (T45 a T67) | dev-backend | `Obras/*Testes.cs` | 11 |
| 14 | E2 | Catálogo: as 6 rotas com o cenário; `EntradaCatalogo` com o recurso alheio; `Concretizar(padrao, recursos)`; marcadores com o nome da obra de B; meta-teste T77; X5 | dev-backend | `Isolamento/*.cs` | 11 |
| 15 | E3 | `ConsultasAuditoria`: trilha por obra (keyset `(em, id)`) e páginas da exportação (keyset de `id`, período, obra opcional), `AsNoTracking` | dev-backend | `server/src/CronoAI.Dados/Auditoria/ConsultasAuditoria.cs` | E2 |
| 16 | E3 | `EscritorCsvAuditoria` (puro: BOM, `;`, `CRLF`, aspas, neutralização) + T06, T07 | dev-backend | `Auditoria/EscritorCsvAuditoria.cs`, `server/tests/.../Auditoria/EscritorCsvTestes.cs` | E2 |
| 17 | E3 | `AuditoriaEndpoints` (2 rotas), cursor opaco, filtros, política `exportacao` (`OpcoesBorda.LimiteExportacaoPorMinuto`, padrão 10), escrita em fluxo; catálogo (2 entradas); OpenAPI regerado | dev-backend | `Auditoria/*.cs`, `Borda/BordaExtensoes.cs`, `Borda/OpcoesBorda.cs`, `appsettings.json`, `Program.cs`, `CatalogoRotas.cs`, `server/openapi/CronoAI.Api.json` | 15, 16 |
| 18 | E3 | Testes da trilha e da exportação (T68 a T76) | dev-backend | `server/tests/.../Auditoria/*Testes.cs` | 17 |
| 19 | E4 | **R18** (bloqueia) e **R19** (alerta) em `regrasBackend`, com casos em `regras-cronoai.test.mjs` (T78, T79) | dev-backend | `.claude/scripts/lib/regras-cronoai.mjs`, `regras-cronoai.test.mjs` | E1 |
| 20 | E4 | **ADR 00009** "Trilha de auditoria append-only e concorrência otimista da obra" (`Proposto`): §3.4 e §3.5, limite contra o dono e o superusuário, Q1/Q2/Q6, gatilho de reavaliação do particionamento, aviso do id substituto para o 00015. Número: o próximo livre que não colida com 00002/00003 (Fase 1, na `master`) nem com as reservas 00007/00008 do PLANO (**conferir** no `/adr`). Índice dos ADRs | orquestrador (`/adr`), revisão do arquiteto | `.claude/adrs/00009-*.md`, `README.md` | gate |
| 21 | E4 | Ajustes de documentação:<br>• **ADR 00004:** concorrência (`obra.versao` por gatilho; `xmin` continua valendo para entidade sem filhos), exceção Q3 da semente, tabelas de referência globais;<br>• **ADR 00006:** lista global fora do RLS, padrão de políticas da trilha, notas para o 00014 (reatribuir o responsável antes de remover membro; `MembroEmpresa`/`Sessao`/`Empresa` passam a ser auditáveis);<br>• **`backend-dotnet.md`:** `SalvarAuditadoAsync`, R18/R19, `versao` no corpo, 409/404, lista branca, `{id}` real no catálogo;<br>• **checklist ASVS** (V1, V2, V4, V8, V14, V16);<br>• **SPEC-01 §5:** linha da `obra` e da `auditoria` como no §07; `data_inicio`/`calendario_id`/`premissas` no 00015;<br>• **SPEC-02 RF-02.4:** nota "IP: pendente do Jurídico (ciclo 00013, Q6)";<br>• `CLAUDE.md` (stack e mapa) e `server/README.md` | dev-backend | arquivos do E4 | 20 |
| 22 | — | Evidências:<br>• `dotnet build -c Release`, `dotnet test`, `dotnet format --verify-no-changes`, `dotnet list package --vulnerable --include-transitive`;<br>• `node --test .claude/scripts/lib/regras-cronoai.test.mjs`;<br>• `validar-regras.mjs --base {BASE}` e `classificar-diff.mjs --base {BASE} --faixa 3`;<br>• `npm run ci`;<br>• `git diff --name-only` (front intacto);<br>• subida local com curl: criar, editar, 409, arquivar, exportar | orquestrador | — | 14, 18, 21 |

### Grafo
```
gate ─ 1 ─ 2 ─┬─ 3 ─ 4 ─ 5 ─ [checkpoint] ─┬─ 7 ─┐
              └─ 6 ────────────────────────┴─ 8 ─┴─ (E1 pronto)        (E1)
E1 ─ 9 ─ 10 ─┬─ 11 ─┬─ 13 ─┐
             │      └─ 14 ─┼─ (E2 pronto)                              (E2)
             └─ 12 ────────┘
E2 ─┬─ 15 ─┐
    └─ 16 ─┴─ 17 ─ 18 ─ (E3 pronto)       ← linha de corte (00013b)    (E3)
E1 ─ 19 ─┐
gate ─ 20 ┴─ 21 ─┐                                                     (E4)
                 └─ 22 (depois de 14, 18 e 21)
```
- **Paralelo:**
  - 6 corre junto com 3 a 5;
  - 7 e 8 correm em paralelo;
  - 12 corre em paralelo com 11, 13 e 14;
  - 15 e 16 correm em paralelo;
  - o E4 (19 a 21) corre em paralelo com o E2 e o E3.
- **Dependência dura:** o modelo do E1 (tarefas 3 a 5) vem antes de qualquer contrato da API.

## 11. Testes previstos
Projeto `server/tests/CronoAI.Api.Testes`, exceto T78/T79 (`node --test`).
- **(U)** = unidade, sem Docker.
- **(I)** = integração (Testcontainers), conectada como **`cronoai_app`** com contexto, salvo indicação.
- **(mig)** = conexão do migrador.
- **(boot)** = conexão de bootstrap, **só dentro da fixture** e só para produzir estado ou o controle positivo.
- **CN** = controle negativo: prova que o teste detecta a falha que diz detectar.

### 11.1 Domínio e CSV (U)
| # | Teste | AC | Arquivo | Resultado esperado | CN |
|---|---|---|---|---|---|
| T01 | `CodigoMunicipioIbge_aceita_dv_valido` (Theory: `3550308`, `2611606`, `5300108`, `2699999`) | AC-19 | `Dominio/CodigoMunicipioIbgeTestes.cs` | válido | T02 |
| T02 | `CodigoMunicipioIbge_recusa_dv_errado_e_formato` (Theory: `3550307`, `3550300`, `355030`, `35503080`, `35A0308`, `" 3550308"`, `""`) | AC-19 | idem | `ArgumentException` com o campo | — |
| T03 | `Obra_criar_recusa_campos_invalidos` (Theory: nome vazio, só espaços, 201 caracteres, com `\0`; UF `sp`, `S`; SINAPI parcial; regime `x`; data-base dia 2; opções não objeto) | AC-10 | `Dominio/ObraTestes.cs` | `ArgumentException` com o campo | caso válido passa |
| T04 | `Obra_nome_e_aparado_nas_pontas` | AC-10 | idem | `"  Obra A  "` → `"Obra A"` | — |
| T05 | `Obra_arquivar_e_restaurar_so_mudam_arquivamento` | AC-12 | idem | Só `ArquivadaEm`/`AtualizadaEm` mudam; arquivar arquivada e restaurar ativa lançam | — |
| T06 | `Csv_neutraliza_celulas_perigosas` (Theory: `=1+1`, `+1`, `-1`, `@SOMA(A1)`, `"\tx"`, `"\rx"`) | AC-15 | `Auditoria/EscritorCsvTestes.cs` | Saída `"'=1+1"` etc. | T07 |
| T07 | `Csv_celula_comum_intacta_e_aspas_duplicadas` | AC-15 | idem | `Obra Aurora` intacta; `1-2` intacta; `a"b` → `"a""b"` | é o CN de T06 |
| T08 | `Metadados_recusam_motivo_invalido` (501 caracteres, `\0`) | AC-9 | `Dominio/MetadadosEscritaTestes.cs` | `ArgumentException`; motivo nulo aceito | — |

### 11.2 Banco (I)
| # | Teste | AC | Arquivo | Resultado esperado | CN |
|---|---|---|---|---|---|
| T10 | `Uf_referencia_tem_as_27_ufs_da_tabela` | AC-3 | `Dados/ReferenciasTestes.cs` | 27 linhas iguais ao §07.4; siglas e códigos únicos | — |
| T11 | `Municipio_referencia_vazia_apos_migracao` | AC-3 | idem | 0 linhas (banco recém-migrado, antes do seed fictício) | — |
| T12 | `Referencias_globais_so_leitura_para_aplicacao` | AC-3 | idem | `has_table_privilege` SELECT = t, INSERT/UPDATE/DELETE = f; `INSERT` como app → `42501` | INSERT em `obra` = t |
| T13 | `Rls_obra_isola_empresas` | AC-4 | `Dados/RlsObraAuditoriaTestes.cs` | Contexto A só lê A; INSERT com `empresa_id` B → `42501`; UPDATE de obra de B → 0 linhas | (boot) vê A e B |
| T14 | `Rls_auditoria_isola_empresas` | AC-4 | idem | Idem para SELECT/INSERT; INSERT no identity funciona como app | (boot) vê A e B |
| T15 | `Obra_nao_muda_de_empresa` | AC-4 | idem | `UPDATE ... SET empresa_id = B` sob contexto A → `42501` | UPDATE de `nome` passa |
| T16 | `Auditoria_app_nao_altera_nem_apaga` | AC-5 | `Dados/AppendOnlyTestes.cs` | UPDATE, DELETE, TRUNCATE como app → `42501` | UPDATE em `obra` funciona (o harness escreve) |
| T17 | `Auditoria_gatilho_recusa_ate_o_dono` (mig) | AC-5 | idem | UPDATE, DELETE e TRUNCATE → `restrict_violation` (23001), **inclusive com 0 linhas** | gêmea `auditoria_controle` (`CREATE TABLE (LIKE ...)` no teste, sem gatilho): o mesmo UPDATE passa |
| T18 | `Auditoria_gatilho_independe_dos_privilegios` (mig) | AC-5 | idem | Em transação desfeita: `GRANT UPDATE, DELETE, TRUNCATE` ao app; os comandos ainda falham; `ROLLBACK` | gêmea com o mesmo GRANT e sem gatilho: passa |
| T19 | `Auditoria_catalogo` | AC-5 | idem | `tgenabled = 'A'`, `tgtype` de instrução; `has_table_privilege` falso para UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES e verdadeiro para SELECT/INSERT; `pg_policies` só SELECT e INSERT; dono = migrador | o mesmo em `obra`: UPDATE = t |
| T20 | `Obra_sem_delete_para_aplicacao` | AC-12 | idem | `DELETE` como app → `42501`; `has_table_privilege(DELETE) = f` | — |
| T21 | `Obra_versao_nasce_1_e_gatilho_ignora_valor_enviado` | AC-6 | `Dados/VersaoObraTestes.cs` | INSERT → 1; `UPDATE SET versao = 999, nome = ...` → 2 | — |
| T22 | `Obra_versao_lida_de_volta_pelo_ef` | AC-6 | idem | Depois do `SalvarAuditadoAsync`, `obra.Versao` = valor do banco (2) | — |
| T23 | `Obra_versao_velha_lanca_concorrencia_no_ef` | AC-6 | idem | Dois contextos leem n; A grava (n+1); B grava com n → `DbUpdateConcurrencyException`; nada de B gravado | B relê e grava: sucesso, n+2 |
| T24 | `Obra_checks_do_banco` (Theory: nome vazio, município com 6 dígitos, SINAPI parcial, data-base dia 2, regime inválido, opções em array, opções com mais de 16 KB) | AC-10 | `Dados/RestricoesObraTestes.cs` | `23514` com a constraint esperada | valores válidos passam |
| T25 | `Obra_municipio_com_prefixo_de_outra_uf_falha` | AC-10 | idem | UF `SP` + `2699999` → `23503` (`fk_obra_municipio_uf`) | UF `PE` + `2699999` passa |
| T26 | `Obra_uf_e_sinapi_uf_inexistentes_falham` | AC-10 | idem | `XX` → `23503` (`fk_obra_uf` / `fk_obra_sinapi_uf`) | — |
| T27 | `Obra_responsavel_so_membro_da_mesma_empresa` | AC-10 | idem | Não membro → `23503`; membro só de B → `23503`; nulo e membro de A passam | — |
| T28 | `Obra_nome_unico_entre_ativas_por_empresa` | AC-11 | idem | Mesmo nome com outra caixa → `23505`; depois de arquivar a 1ª, passa; outra empresa com o mesmo nome passa | — |
| T29 | `Fk_de_municipio_pos_carga_com_not_valid_e_validate` (mig) | AC-3 | `Dados/ReferenciasTestes.cs` | Em transação desfeita, sobre a gêmea `obra_controle_municipio` com município fictício: `ADD CONSTRAINT ... NOT VALID` aceita a linha antiga fora da lista e recusa a nova (`23503`); `VALIDATE` falha até corrigir e passa depois | — |
| T30 | `Auditoria_atomica_quando_a_mudanca_falha` | AC-8 | `Dados/AuditoriaInterceptorTestes.cs` | Obra com UF fora da referência → **nenhuma** linha de obra nem de auditoria | valores válidos: as duas linhas, `depois` igual ao estado |
| T31 | `Auditoria_atomica_quando_a_auditoria_falha` | AC-8 | idem | Mudança válida + `RegistroAuditoria` inválido injetado no mesmo `SaveChanges` (`acao` fora do `CHECK`) → obra com a versão e os valores antigos | sem a injeção, a obra muda e a auditoria existe |
| T32 | `Auditoria_registra_so_campos_alterados_da_lista_branca` | AC-8, AC-9 | idem | `criar`: `antes` nulo e `depois` com os 10 campos; `alterar` só `nome`: `{"nome":...}`; chaves em `snake_case` | entidade de teste com campo fora da lista: o campo é descartado |
| T33 | `Auditoria_acao_derivada_do_arquivamento` | AC-8 | idem | `arquivar` e `restaurar` com `antes`/`depois` de `arquivada_em` | — |
| T34 | `Auditoria_versao_depois_confere_com_o_banco` | AC-8 | idem | `versao_depois` = `obra.versao` depois de cada escrita (1, 2, 3) | — |
| T35 | `SaveChanges_com_auditavel_sem_metadados_lanca` | AC-9 | idem | `SaveChangesAsync` comum com `Obra` alterada → `InvalidOperationException`; nada gravado | entidade não auditável (`Sessao`) grava |
| T36 | `Remover_entidade_auditavel_lanca` | AC-9 | idem | `Remove(obra)` + `SalvarAuditadoAsync` → `InvalidOperationException` | — |
| T37 | `Auditoria_colunas_sem_ip_nem_dado_pessoal` | AC-9 | idem | `information_schema.columns` de `auditoria` = a lista do §07.1 (sem `ip`); `jsonb` sem `nome_exibicao`, `emissor`, `sujeito`, e-mail | — |

### 11.3 Arquitetura (U)
| # | Teste | AC | Resultado esperado |
|---|---|---|---|
| T40 | `Auditoria_so_recebe_Add` | AC-16 | Varredura de `server/src/**/*.cs`: `RegistroAuditoria` e `.Auditorias` só com `Add`/`AddRange` e leitura em `ConsultasAuditoria.cs` |
| T41 | `Sem_ExecuteUpdate_ExecuteDelete_em_entidade_auditada` | AC-16 | Nenhum arquivo com `ExecuteUpdate`/`ExecuteDelete` referencia `Obra` ou `RegistroAuditoria` |
| T42 | `Toda_entidade_auditavel_tem_lista_branca` | AC-16 | Todo `IAuditavel` do modelo tem entrada em `ListaBrancaAuditoria`, e toda propriedade listada existe |
| T43 | `Entidade_gravavel_de_empresa_e_auditavel_ou_excecao_declarada` | AC-16 | `IDadoDeEmpresa` gravável é `IAuditavel` ou está em `{MembroEmpresa, Sessao, Empresa}`; `RegistroAuditoria` excluída por definição |
| T44 | `Obra_id_empresa_e_criacao_imutaveis_no_modelo` | AC-4 | `GetAfterSaveBehavior() == Throw` em `Id`, `EmpresaId`, `CriadaEm` |

### 11.4 API de obras (I)
| # | Teste | AC | Arquivo | Resultado esperado | CN |
|---|---|---|---|---|---|
| T45 | `Criar_obra_201_versao_1_location_e_auditoria` | AC-8, AC-10 | `Obras/CriarObraTestes.cs` | 201, `Location` `/api/v1/obras/{id}`, `versao = 1`, 1 auditoria `criar` com `usuario_id` da sessão | — |
| T46 | `Criar_obra_ignora_empresa_id_e_versao_do_corpo` | AC-10 | idem | Corpo com `empresaId` de B e `versao: 9` → obra em A, versão 1 | — |
| T47 | `Criar_obra_valida_entrada` (Theory, 12 casos: cada campo inválido do T03 + UF inexistente + prefixo de outra UF + DV errado) | AC-10 | idem | 400 `ValidationProblem` com a chave do campo; corpo sem texto do PostgreSQL nem nome de constraint | caso válido 201 |
| T48 | `Responsavel_alheio_ou_inexistente_da_o_mesmo_400` | AC-10 | idem | Membro de B e uuid inexistente → 400 com corpos iguais (exceto `traceId`) | membro de A → 201 |
| T49 | `Corpo_acima_do_limite_413` | AC-10 | idem | 65 KB → 413 | 60 KB válido → 201 |
| T50 | `Listar_exclui_arquivadas_por_padrao` | AC-12 | `Obras/ListarObrasTestes.cs` | Padrão sem a arquivada; `incluirArquivadas=true` com ela; nenhuma obra de B | — |
| T51 | `Obter_inexistente_e_de_outra_empresa_404_identico` | AC-7 | `Obras/ObterObraTestes.cs` | Os dois 404, corpos iguais (exceto `traceId`) | obra de A → 200 |
| T52 | `Atualizar_com_versao_atual_200_e_auditoria` | AC-6, AC-8 | `Obras/AtualizarObraTestes.cs` | 200, `versao = 2`, 1 auditoria `alterar` só com os campos mudados, `motivo` gravado | — |
| T53 | `Atualizar_sem_versao_400` | AC-7 | idem | 400 com a chave `versao` | — |
| T54 | `Atualizar_com_versao_velha_409_com_estado_atual_sem_gravar` | AC-6, AC-8 | idem | 409 `conflito-de-versao`, `estadoAtual.versao = n+1`, `estadoAtual.nome` = o gravado por A; banco inalterado; **0** auditorias novas | releitura + PUT → 200 (n+2) |
| T55 | `Escrita_em_obra_de_outra_empresa_404_sem_alterar_nem_auditar` (Theory: PUT, arquivar, restaurar; com a versão certa da obra de B) | AC-7 | idem | 404 (nunca 409); obra de B com a mesma versão; 0 auditorias | — |
| T56 | `Atualizar_sem_mudanca_nao_incrementa_nem_audita` | AC-8 | idem | 200, mesma versão, 0 auditorias | — |
| T57 | `Atualizar_obra_arquivada_409` | AC-7 | idem | 409 `obra-arquivada` com `estadoAtual` | — |
| T58 | `Concorrencia_paralela_um_sucesso_nove_409` | AC-6 | `Obras/ConcorrenciaObraTestes.cs` | `Task.WhenAll` de 10 PUTs com a mesma versão → 1×200, 9×409, 1 auditoria `alterar` | versões sequenciais: 10×200 |
| T59 | `Arquivar_e_restaurar_com_versao_e_auditoria` | AC-12 | `Obras/ArquivamentoObraTestes.cs` | Arquivar → 200, versão +1, `arquivadaEm` preenchida, auditoria `arquivar`; restaurar → versão +1, auditoria `restaurar` | — |
| T60 | `Arquivar_arquivada_e_restaurar_ativa_409` | AC-12 | idem | 409 com `estadoAtual` | — |
| T61 | `Nome_duplicado_409_em_criar_renomear_e_restaurar` | AC-11 | `Obras/NomeObraTestes.cs` | 409 `obra-nome-duplicado` nos três | outra empresa com o mesmo nome → 201 |
| T62 | `Criacoes_simultaneas_mesmo_nome_um_201_um_409` | AC-11 | idem | 2 POSTs paralelos → 1×201, 1×409 | — |
| T63 | `Rotas_de_obra_sem_empresa_ativa_403` | AC-13 | `Obras/AutorizacaoObraTestes.cs` | As 6 rotas → 403 `empresa-ativa-necessaria` | — |
| T64 | `Escrita_grava_correlacao_do_traceparent_e_origem_ui` | AC-8 | idem | `traceparent` enviado → `correlacao_id` = trace id; `origem = 'ui'`; `em` = `RelogioTeste` | — |
| T65 | `Delete_de_obra_nao_existe_405` | AC-12 | idem | `DELETE /obras/{id}` → 405; obra intacta | — |
| T66 | `Escritas_de_obra_nao_logam_nome_motivo_nem_conteudo` | AC-20 | `Obras/LogsObraTestes.cs` | `LogsEmMemoria` sem o nome, o motivo nem o JSON; com o id da obra | — |
| T67 | `Toda_rota_de_escrita_de_obra_gera_uma_auditoria` | AC-8 | `Obras/AuditoriaPorRotaTestes.cs` | Para cada escrita de `/api/v1/obras` no catálogo: delta de exatamente 1 auditoria com a ação esperada; rota de escrita nova sem caso reprova | — |
| T38 | `Obra_some_entre_leitura_e_gravacao_vira_404` | AC-7 | `Obras/ServicoObrasCorridaTestes.cs` | Obra criada sem auditoria pela fixture e removida pela conexão (boot) entre o carregamento e o `SaveChanges` (gancho de teste no serviço) → resultado 404 | — |
| T39 | `Obra_arquivada_entre_leitura_e_gravacao_vira_409` | AC-7 | idem | Outro contexto arquiva entre o carregamento e o `SaveChanges` → 409 com `estadoAtual.arquivadaEm` preenchida | — |

### 11.5 Trilha e exportação (I)
| # | Teste | AC | Arquivo | Resultado esperado | CN |
|---|---|---|---|---|---|
| T68 | `Trilha_da_obra_ordenada_com_cursor_e_limite` | AC-14 | `Auditoria/TrilhaObraTestes.cs` | 5 registros, `limite=2` → 3 páginas, ordem `(em DESC, id DESC)`, sem repetir nem pular | — |
| T69 | `Trilha_cursor_ou_limite_invalidos_400` (Theory: cursor adulterado, `limite=0`, `limite=201`) | AC-14 | idem | 400 | `limite=200` → 200 |
| T70 | `Trilha_expoe_usuario_id_sem_nome` | AC-14, AC-9 | idem | Item com `usuarioId`; corpo sem o `nome_exibicao` do usuário | — |
| T71 | `Exportacao_csv_formato` | AC-15 | `Auditoria/ExportacaoCsvTestes.cs` | BOM, cabeçalho do §05, `;`, `CRLF`, todo campo entre aspas, `text/csv; charset=utf-8`, `Content-Disposition` com nome fixo | — |
| T72 | `Exportacao_csv_neutraliza_texto_malicioso_ponta_a_ponta` | AC-15 | idem | Motivos `=HYPERLINK(...)`, `+1`, `-1`, `@x`, `\tx`, `\rx` saem com `'` | motivo `revisão de prazo` intacto |
| T73 | `Exportacao_filtros_e_teto_de_366_dias` | AC-15 | idem | Filtra por obra e período; 367 dias → 400; `de > ate` → 400; sem `de` → 400 | 366 dias → 200 |
| T74 | `Exportacao_com_obra_de_outra_empresa_404` | AC-13 | idem | `obraId` de B → 404, sem linha de B | `obraId` de A → 200 |
| T75 | `Exportacao_percorre_por_keyset_sem_repetir_nem_pular` | AC-15 | idem | Página de 2 (configurada no teste), 5 registros → 5 linhas, cada id uma vez, em ordem | — |
| T76 | `Exportacao_limite_de_taxa_429` | AC-15 | idem | Limite de teste 3/min: a 4ª chamada → 429 com `Retry-After` | — |

### 11.6 Isolamento (I) e regras (node)
| # | Teste | AC | Arquivo | Resultado esperado |
|---|---|---|---|---|
| T77 | `Concretizacao_de_id_usa_obra_real_da_empresa_B` (meta, CN do X5) | AC-13 | `Isolamento/IsolamentoRotasTestes.cs` | Para cada entrada `ComIdDeOutraEmpresa` de obra, o id concretizado existe no banco (boot) e tem `empresa_id = B` |
| T78 | R18, casos | AC-16 | `.claude/scripts/lib/regras-cronoai.test.mjs` | **Acusa:**<br>• `.ExecuteUpdateAsync(` em `CronoAI.Api/Obras/X.cs`;<br>• `.ExecuteDelete(` em `CronoAI.Dados/Auditoria/X.cs`;<br>• `ExecuteSqlAsync($"UPDATE cronoai.obra SET` em `CronoAI.Api`;<br>• `ExecuteSql($"DELETE FROM cronoai.auditoria` em `CronoAI.Dados`;<br>• `SqlQuery<int>($"INSERT INTO cronoai.auditoria`.<br>**Não acusa:**<br>• `ExecuteUpdateAsync` em `ConsultasIdentidade.cs`;<br>• comentário;<br>• `server/tests/**`;<br>• `migrationBuilder.Sql("CREATE TRIGGER ... ON cronoai.auditoria")` em `Migrations/`;<br>• `SELECT ... FROM cronoai.auditoria` |
| T79 | R19, casos (alerta) | AC-16 | idem | **Acusa** em `Migrations/`: `DISABLE TRIGGER trg_auditoria_append_only`, `DROP POLICY pol_auditoria_select`, `GRANT UPDATE ON cronoai.auditoria`, `auditoria NO FORCE ROW LEVEL SECURITY`.<br>**Não acusa:** a mesma linha fora de `Migrations/` (já é R15); `CREATE TRIGGER` da criação; linha sobre `obra` |

### 11.7 Testes existentes estendidos
| # | Teste | AC | Mudança |
|---|---|---|---|
| X1 | `Migracao_IdentidadeEmpresas_aplica_e_reaplica` → `Migracoes_aplicam_e_reaplicam` (`MigracoesTestes.cs`) | AC-2 | 3 migrações aplicadas; o 2º `MigrateAsync` não lança; `Modelo_sem_mudanca_pendente` continua `false` |
| X2 | `Toda_tabela_tem_rls_forcado_ou_esta_na_lista_global` (`CatalogoTestes.cs`) | AC-3, AC-4 | Lista global com `uf_referencia` e `municipio_referencia`; `obra` e `auditoria` com `FORCE` |
| X3 | `Politicas_sao_por_comando_e_so_para_cronoai_app` | AC-4, AC-5 | `obra`: SELECT/INSERT/UPDATE; `auditoria`: SELECT/INSERT |
| X4 | `Privilegios_da_aplicacao_por_tabela` (`PrivilegiosIdentidadeTestes.cs`) | AC-3, AC-5, AC-12 | `InlineData` das 4 tabelas novas conforme o §07.2 |
| X5 | `Usuario_da_empresa_A_nao_ve_dado_da_empresa_B_em_nenhuma_rota` (`IsolamentoRotasTestes.cs`) | AC-13 | `{id}` = obra real de B (T77); marcador = nome da obra de B |
| X6 | `Dono_tambem_se_sujeita_ao_rls` (`RlsTestes.cs`) | AC-4 | Migrador sem contexto e com `app.*` → 0 linhas em `obra` e `auditoria` |

Cobertura automática, sem mudança de código: `Identificadores_cabem_em_63_bytes`, `Fks_do_schema_sao_restrict`, `Modelo_so_tem_fks_restrict`, `Entidade_com_EmpresaId_implementa_IDadoDeEmpresa_e_tem_filtro_Empresa`, `Toda_rota_registrada_tem_cenario_de_isolamento`, `Toda_escrita_exige_antiforgery`, `Toda_rota_nao_anonima_responde_401_sem_sessao`.

**Totais:** 78 testes novos (T01 a T08 e T10 a T79; o T09 não é usado) e 6 testes existentes estendidos (X1 a X6). Com as Theories, são cerca de 140 casos.

## 12. Critérios de aceite e escopo fechado
- **AC-1:** build Release com 0 avisos; `format` limpo; `dotnet test` verde; diff do OpenAPI vazio após o build.
- **AC-2:** a migração `ObrasAuditoria` produz o modelo do §07 (tipos, `CHECK`s, FKs compostas, coluna gerada, índice parcial, funções, gatilhos e privilégios). Aplica, reaplica, não deixa pendência e o `Down()` remove tudo.
- **AC-3:**
  - `uf_referencia` com exatamente as 27 linhas do §07.4;
  - `municipio_referencia` vazia;
  - as duas fora do RLS, na lista global, só com `SELECT` para o `cronoai_app`;
  - nenhuma FK para `municipio_referencia`, e o procedimento futuro `NOT VALID` → `VALIDATE` provado na gêmea.
- **AC-4:** RLS `FORCE` em `obra` e `auditoria`, com as políticas exatas do §07.2 (`TO cronoai_app`, por comando). Como `cronoai_app`:
  - sem contexto → 0 linhas;
  - com contexto A → só A;
  - INSERT com B → `42501`;
  - UPDATE de obra de B → 0 linhas;
  - mover a obra de empresa → recusado.

  O dono também vê 0 linhas. `Id`, `EmpresaId` e `CriadaEm` são imutáveis no EF.
- **AC-5:** append-only em três camadas, cada uma provada sozinha com controle negativo:
  - app → `42501`;
  - dono → `restrict_violation`, inclusive com 0 linhas e TRUNCATE;
  - privilégios devolvidos em transação desfeita → continua recusando;
  - catálogo com `tgenabled = 'A'` e a matriz de privilégios.
- **AC-6:** `versao`:
  - nasce 1 e o gatilho incrementa em todo UPDATE, ignorando o valor enviado;
  - o EF lê o valor de volta;
  - versão velha → `DbUpdateConcurrencyException` no banco e 409 com `estadoAtual.versao = n+1` na API, sem gravar;
  - 10 PUTs paralelos → 1 sucesso, 9 conflitos, 1 auditoria.
- **AC-7:**
  - obra de outra empresa → 404 idêntico ao de inexistente, **nunca 409**, sem alterar nem auditar;
  - `versao` ausente → 400;
  - `PUT` em arquivada → 409 `obra-arquivada`;
  - arquivada entre a leitura e a gravação → 409 com o estado;
  - sumida entre a leitura e a gravação → 404.
- **AC-8:** toda rota de escrita grava exatamente 1 auditoria na mesma transação, com:
  - a ação certa;
  - só os campos alterados da lista branca;
  - `usuario_id` da sessão, `origem = 'ui'`, `motivo` quando enviado;
  - `correlacao_id` do `traceparent`;
  - `versao_depois` igual à do banco e `em` do `TimeProvider`.

  A falha de qualquer lado desfaz os dois. 400, 404 e 409 não gravam nada. `PUT` sem mudança não incrementa nem audita.
- **AC-9:**
  - sem coluna `ip`;
  - sem nome, e-mail, emissor nem sujeito na trilha;
  - campo fora da lista branca descartado;
  - `SaveChanges` com entidade auditável sem metadados lança;
  - remover entidade auditável lança;
  - `motivo` com até 500 caracteres e sem `\0`.
- **AC-10:** validação da obra no domínio e no banco, com 400 `ValidationProblem` por campo e nenhum texto do PostgreSQL na resposta:
  - nome (1 a 200, aparado, sem caractere de controle);
  - UF existente;
  - município (formato, DV, prefixo da UF);
  - SINAPI (tudo ou nada, regime, dia 1);
  - `opcoes_cronograma` (objeto, até 16 KB);
  - responsável (nulo ou membro da mesma empresa; alheio e inexistente com o mesmo 400);
  - `data_status` nula aceita.

  Corpo acima de 64 KB → 413. `empresaId` e `versao` no corpo do POST são ignorados.
- **AC-11:** nome único (sem diferenciar maiúsculas) entre as obras não arquivadas da empresa:
  - criar, renomear ou restaurar com conflito → 409 `obra-nome-duplicado`;
  - arquivar libera o nome;
  - outra empresa pode repetir o nome;
  - criação simultânea → 1×201 e 1×409.
- **AC-12:** arquivar e restaurar auditados e versionados:
  - listagem sem arquivadas por padrão;
  - `GET /{id}` lê a arquivada;
  - nenhuma rota `DELETE` (405);
  - o app sem privilégio de `DELETE` em `obra`.
- **AC-13:** isolamento:
  - as 8 rotas no catálogo com o cenário do §3.7;
  - `{id}` concretizado com uma obra **real** da empresa B (meta-teste);
  - nenhum marcador de B em nenhuma rota;
  - exportação com `obraId` de B → 404;
  - sem empresa ativa → 403.
- **AC-14:** `GET /obras/{id}/auditoria`:
  - ordem `(em DESC, id DESC)`;
  - cursor opaco (inválido → 400);
  - `limite` de 1 a 200;
  - só `usuarioId`, sem nome.
- **AC-15:** exportação CSV:
  - formato do §05 (BOM, `;`, `CRLF`, aspas, cabeçalho, `Content-Disposition` fixo);
  - neutralização de `=`, `+`, `-`, `@`, TAB e CR com controle negativo;
  - filtros com teto de 366 dias;
  - keyset sem `OFFSET` nem repetição;
  - 429 com `Retry-After`.
- **AC-16:**
  - R18 (bloqueia) e R19 (alerta) no `validar-regras`, com casos verdes;
  - testes de arquitetura T40 a T43;
  - `validar-regras --base {BASE}` com 0 bloqueios.
- **AC-17:** documentação atualizada:
  - ADR 00009 (`Proposto`);
  - ADRs 00004 e 00006 ajustados;
  - `backend-dotnet.md` e checklist ASVS;
  - SPEC-01 §5 e nota na SPEC-02 RF-02.4;
  - `CLAUDE.md` e `server/README.md`.
- **AC-18:** front intacto. `npm run ci` verde; nada em `src/`, `e2e/`, `Dockerfile`, `docker/`, `docker-compose.yml` nem `.github/`.
- **AC-19:** função do DV fixada pelos casos do §07.4. DV errado → 400 antes de ir ao banco.
- **AC-20:** as escritas de obra não registram em log o nome, o motivo nem o conteúdo de `antes`/`depois`/`opcoes_cronograma`; só ids.

### Matriz de verificação prevista
| Item | Requisito | Verificação | Obrig. |
|---|---|---|---|
| AC-1 | Build, format, testes, OpenAPI | comandos do AC-1 | sim |
| AC-2 | Migração | X1, checkpoint do orquestrador | sim |
| AC-3 | Referências | T10 a T12, T29, X2, X4 | sim |
| AC-4 | RLS de obra e auditoria | T13 a T15, T44, X2, X3, X6 | sim |
| AC-5 | Append-only em 3 camadas | T16 a T19, X3, X4 | sim |
| AC-6 | Versão e 409 | T21 a T23, T52, T54, T58 | sim |
| AC-7 | 404 × 409 × 400 | T38, T39, T51, T53, T55, T57 | sim |
| AC-8 | Auditoria na mesma transação | T30 a T34, T45, T52, T54, T56, T64, T67 | sim |
| AC-9 | Minimização e falha fechada | T08, T32, T35 a T37, T70 | sim |
| AC-10 | Validação | T03, T04, T24 a T27, T46 a T49 | sim |
| AC-11 | Nome único | T28, T61, T62 | sim |
| AC-12 | Arquivar e restaurar | T05, T20, T50, T59, T60, T65, X4 | sim |
| AC-13 | Isolamento | T63, T74, T77, X5 | sim |
| AC-14 | Trilha por obra | T68 a T70 | sim |
| AC-15 | CSV | T06, T07, T71 a T73, T75, T76 | sim |
| AC-16 | R18/R19 e arquitetura | T40 a T43, T78, T79, `validar-regras` | sim |
| AC-17 | Documentação | diff | sim |
| AC-18 | Front intacto | `npm run ci`; `git diff --name-only` | sim |
| AC-19 | DV do IBGE | T01, T02, T47 | sim |
| AC-20 | Logs | T66 | sim |
| R-1 | Camadas | `ArquiteturaTestes` | sim |
| R-2 | DDL só em migração; nenhum DML de migração fora do helper (a semente usa `InsertData` em tabela sem RLS) | R15 + leitura | sim |
| R-3 | Estilo do ADR 00004 | leitura do `arquiteto` | sim |
| S-1 | Sem segredo versionado | `ConfiguracaoTestes`, R08 | sim |
| S-2 | Nenhuma dependência nova | diff de `Directory.Packages.props` e dos *lock files* vazio | sim |
| S-3 | Atribuição em massa | T46 | sim |
| S-4 | CSRF nas escritas novas | `Toda_escrita_exige_antiforgery` | sim |
| S-5 | Injeção de fórmula no CSV | T06, T07, T72 | sim |
| S-6 | Limites de corpo e de `jsonb` | T49, T24 | sim |
| S-7 | Erro sem detalhe interno | T47, T48 | sim |
| S-8 | Testes de banco como `cronoai_app` (boot só na fixture) | leitura | sim |
| V-1 | **Usuário confere os 27 códigos de UF contra a fonte oficial do IBGE** | registro no ciclo | **sim, bloqueia o merge** |
| V-2 | Subida local: criar, editar, 409 em duas abas (curl), arquivar, exportar e abrir o CSV no Excel | orquestrador; Excel opcional | não |
| V-3 | Usuário revisa Q1 a Q8 no PR | PR | sim |
| AUD | Auditoria independente | `revisor` em modo AUDITAR | sim |

**Validadores** (etapa 6, em paralelo, com as saídas `dotnet` e `node --test` no prompt):
- **`arquiteto`:** plano, camadas, fluxo do 409, `SalvarAuditadoAsync`, estilo, escopo fechado;
- **`dba`:** migração, gatilhos, políticas, privilégios, `CHECK`s, índices, testes de catálogo e de append-only;
- **`seguranca`:** §08, CSV, minimização, limites, mapeamento de erros, R18/R19;
- **`testes`:** execução completa e a matriz;
- **auditoria independente:** `revisor` em modo AUDITAR, depois dos quatro;
- `especialista-obra`: conforme a decisão do orquestrador (proposta: dispensar; seção 15).

### Fora do escopo (explícito)
- Front: telas de obra, de conflito 409 e de trilha (00019 e 00020). Nada em `src/`.
- Perfis e matriz perfil × ação. Até o 00014, todo membro da empresa ativa faz tudo em obras.
- Permissões por obra e por frente, frentes e carteiras (00014).
- Auditoria de `empresa`, `membro_empresa` e `sessao` (00014 em diante).
- Tarefas, vínculos, calendários, premissas, `data_inicio` e `calendario_id` (00015). O `PUT` em lote e a versão do agregado por tarefa também são do 00015.
- Recálculo ao mudar UF, município ou data de status (00015/00016).
- **Coluna `ip`** e qualquer coleta de IP (Q6, Jurídico).
- Retenção, descarte, pseudonimização, exceção controlada ao append-only e particionamento (Q6, Jurídico; reavaliar).
- Hash encadeado da trilha.
- Carga da lista oficial de municípios, FK para `municipio_referencia` e exceções do DV (ciclo futuro, insumo do usuário).
- Nome do usuário na trilha ou no CSV.
- `ETag`/`If-Match`, `PATCH`, paginação da listagem de obras.
- Duplicar obra, criar obra a partir de `.xml` (RF-14.1) e importação do `localStorage` (00019).
- Exclusão física de obra por qualquer caminho.
- Semente de obras fictícias no `semear-desenvolvimento`.
- CI, compose, Dockerfile, imagens, Dependabot; qualquer hospedagem.
- Qualquer regra de cronograma ou cálculo.

## 13. Validações com outras áreas
| Tema | Área | Antes de quê |
|---|---|---|
| Trilha com dado pessoal: `usuario_id` (pseudônimo) e `motivo` (texto livre). Prazo de retenção e descarte; procedimento de titular sob append-only (exceção controlada × partição); se e como gravar IP (inteiro, truncado ou nunca), já que o RF-02.4 o pede e o Q6 o deixou fora; exportação da trilha para fora do sistema. **Se o Jurídico exigir descarte por prazo antes do merge, o plano volta à etapa 3 para particionar** | **Jurídico** | Dados reais / piloto |
| Limite do append-only contra dono e superusuário; guarda e backup da trilha; procedimento de privacidade com `SECURITY DEFINER`, se vier; aceite dos itens ASVS V1, V2, V4, V8, V14 e V16 | **Segurança da Informação** | Uso em produção |
| Quem roda migração em produção (dono pode desligar o gatilho); backup e restauração (a `versao` explícita sobrevive); papel de backup sob RLS; IP real atrás de proxy (`ForwardedHeaders`), se o Jurídico aprovar IP | **Infraestrutura** | Primeiro ambiente fora do local |
| 27 códigos de UF (V-1); lista oficial de municípios (fonte, versão, formato); unicidade do nome da obra (Q5, opinião de produto) | **Usuário** | Merge (V-1); ciclo da carga (lista) |

## 14. Riscos e pós-entrega
- **Códigos de UF não verificados** numa fonte oficial (nem pelo `dba` nem por mim). Mitigação: V-1 bloqueia o merge.
- **Município inexistente com DV coincidente passa** até a carga da lista (cerca de 1 em 10 códigos aleatórios). E pode haver **código oficial que não segue o DV** (não verificado). Mitigação: conjunto de exceções pronto (vazio) e a FK no ciclo da carga.
- **Divergência do RF-02.4 (IP).** Cobertura parcial declarada, com nota na SPEC-02 e pendência no Jurídico.
- **Limite do append-only:** o dono (DDL) e o superusuário contornam. Mitigação: R19, teste de catálogo e revisão humana; o resto com Infra e Segurança.
- **Particionamento adiado:** converter depois exige tabela nova + cópia. Gatilho de reavaliação no §3.5 e no §13.
- **`opcoes_cronograma` opaco:** o servidor guarda sem entender. Mitigação: objeto, 16 KB, profundidade 16, front trata como dado; o 00015 normaliza.
- **Todos os membros com todas as ações** até o 00014. Só local.
- **`responsavel_id` com FK `Restrict`** bloqueia a remoção do membro no 00014 até a reatribuição. Nota no ADR 00006.
- **Volume da trilha no 00015** (lotes de 3.000): diff de campos e teto de 256 KB; medir no 00015.
- **APIs a conferir**, todas com teste:
  - coluna gerada + FK no EF/Npgsql;
  - índice por expressão fora do modelo e `has-pending-model-changes`;
  - `RETURNING` da `versao` gerada por gatilho;
  - entradas adicionadas no `SavingChanges`;
  - índice de FK redundante;
  - `IRequestSizeLimitMetadata` em minimal APIs;
  - `Activity.Current.TraceId`;
  - `USAGE` da sequência do identity.

  Plano B de cada um no §3.
- **Tamanho do ciclo (M/G no limite).** Linha de corte no E3 (§09).
- **Conflitos de merge** com o 00012 ainda aberto (há trabalho não commitado na branch dele agora): começar só depois do último commit do 00012; PR empilhado se ele não tiver entrado.
- **Rollback:** reverter os commits. O `Down()` remove gatilhos, funções e tabelas; o banco local sai com `docker compose --profile backend down -v`.
- **Publicação:** nenhuma (Inviolável 8). Versão: decisão do usuário no `/entregar`.

## 15. Decisões do gate e de design

### Decisões do gate (tomadas pelo orquestrador com autorização do usuário, sujeitas à revisão dele no PR)
- **Q1:** o "D" do CRUD de obra é **arquivar** (`arquivada_em`, com `REVOKE DELETE`), não apagar. Aplicado em §3.2, §07.2, AC-12.
- **Q2:** **`versao bigint` explícita**, incrementada por gatilho `BEFORE UPDATE`, no lugar de `xmin`. O contrato leva `versao` no corpo. Em conflito, 409 ProblemDetails com o estado atual. Obra de outra empresa dá **404, nunca 409**. Aplicado em §3.4, AC-6, AC-7.
- **Q3:** seed das 27 UFs por migração, como **exceção registrada ao ADR 00004**. Os códigos IBGE ficam marcados **"conferir com a fonte oficial do IBGE antes do merge (pendência do usuário)"**. Aplicado em §3.3, §07.4, V-1.
- **Q4:** `responsavel_id` é nulo ou FK composta para o vínculo membro da mesma empresa `(empresa_id, usuario_id)`. Não é texto livre. As permissões por obra ficam no 00014. Aplicado em §3.2, §07.1, T27, T48.
- **Q5:** o nome da obra é único por empresa entre as obras não arquivadas, com índice único parcial sobre `(empresa_id, lower(nome)) WHERE arquivada_em IS NULL`. **Isso é opinião de produto e está registrado como tal.** Aplicado em §3.2, AC-11.
- **Q6:** privacidade por padrão. A auditoria **não guarda IP** neste ciclo e `motivo` é opcional. A retenção e a pseudonimização ficam como **pendência do Jurídico**, que este ciclo não decide. Aplicado em §3.5, §07.1, AC-9, §13.
- **Q7:** a lista oficial de municípios é insumo pendente do usuário. A tabela `municipio_referencia` fica vazia, com seed de teste fictício. A validação cobre formato, prefixo da UF e DV. A FK `NOT VALID` só passa a `VALIDATE` depois da carga oficial, num ciclo futuro. **Nota do arquiteto (precisão, sem mudar a intenção):** a FK não é criada neste ciclo, porque `NOT VALID` ainda checa as linhas novas e, com a tabela vazia, recusaria toda obra (§3.3, T29).
- **Q8:** `data_status` pode ser nula. Aplicado em §3.2, §07.1.

### Decisões de processo a confirmar pelo orquestrador
- **`especialista-obra` com T3 = sim:** proposta **dispensar**, porque o CSV só leva a trilha, sem número de obra nem MSPDI [opinião].
- **Número do ADR novo:** 00009 (as reservas 00007/00008 do PLANO e os 00002/00003 da Fase 1 continuam livres); **conferir** no `/adr`.

### Decisões de design tomadas no plano, revisáveis no PR
- Sem coluna `ip` (em vez de coluna nula).
- Metadados obrigatórios por `SalvarAuditadoAsync` (falha fechada).
- Ação derivada do arquivamento.
- `origem = 'ui'` nas rotas com sessão.
- `PUT` de substituição inteira; `PUT` sem mudança não audita.
- Obra arquivada somente leitura (409).
- Trilha e CSV sem nome do usuário.
- CSV com `;`, BOM e aspas em tudo.
- Limite de 64 KB no corpo; teto de 366 dias e limite de taxa na exportação.
- R18 por arquivo (lista permitida) e R19 como alerta.
- Índices de FK da convenção do EF aceitos.
- Linha de corte no E3.

## 16. Emenda 01 (25/10/2026) — parecer do `dba` da tarefa 0
Parecer: `00013-tarefa0-dba.md`, `VEREDITO: AJUSTAR`. Os 4 ajustes e as recomendações, e onde foram aplicados:

| # | Ajuste ou recomendação do parecer | Aplicado em |
|---|---|---|
| 1 | `versao bigint` explícita por gatilho em vez de `xmin` (diverge do PLANO E2, converge com o ADR 00004) | Q2; §3.4; §07.2; T21 a T23; AC-6; ADR 00009 e 00004 (tarefas 20 e 21) |
| 2 | Camadas extras no append-only (gatilho de instrução `ENABLE ALWAYS` + RLS só SELECT/INSERT + `REVOKE` explícito de TRUNCATE) e o limite declarado contra DDL do dono | §3.5; §07.2; T16 a T19; R19; AC-5 |
| 3 | DELETE de obra × auditoria: arquivar, com `REVOKE DELETE` | Q1; §3.2; T20, T65; AC-12 |
| 4 | Município sem lista oficial: formato + prefixo por coluna gerada e FK composta + DV no domínio; `municipio_referencia` vazia; FK adiada; seed fictício | Q7 (com a nota do arquiteto); §3.3; §07; T01, T02, T25, T29; AC-3, AC-19 |
| — | `ExecuteUpdate`/`ExecuteDelete` proibidos (R18) + teste | §3.6; T41, T78; AC-16 |
| — | Neutralização de CSV com TAB e CR | §3.8; T06, T72; AC-15 |
| — | Carregar antes de atualizar; 3 causas da exceção de concorrência (versão velha, sumida, arquivada na corrida) | §3.4; T38, T39, T54; AC-7 |
| — | Lista branca, só campos alterados, `usuario_id` do contexto, sem nome/e-mail/emissor/sujeito | §3.5; T32, T37; AC-9 |
| — | Não particionar agora, com gatilho de reavaliação | §3.5; §13; §14 |
| — | Colunas da SPEC-01 §5 (`calendario_id`, `premissas`, `data_inicio`) fora do 00013 | §3.2; emenda da SPEC-01 (tarefa 21) |
| — | IP em coluna própria (parecer §3.5) | **Não aplicado:** substituído por Q6 (sem IP neste ciclo) |
| — | `responsavel_id` × remoção de membro no 00014 | §3.2; nota no ADR 00006 (tarefa 21); §14 |

---

CONHECIMENTO NOVO:
- O teste genérico de isolamento do 00012 concretiza `{id}` com um `Guid.NewGuid()` (`DetectorDeRotas.cs:52`). Para rota com recurso, o cenário `ComIdDeOutraEmpresa` passa por "não existir", sem provar o isolamento. O `{id}` precisa ser um recurso **real** da outra empresa, com meta-teste que o confira — onde se aplica: toda rota com `{id}` a partir do 00013.
- FK `NOT VALID` não adia a checagem das linhas novas, só das existentes. Contra uma tabela de referência vazia, ela bloqueia toda inserção. A FK só nasce no ciclo que carrega a referência — onde se aplica: `municipio_referencia` e qualquer referência carregada depois.
- A R15 acusa `INSERT INTO` em migração por causa do RLS. A semente de tabela de referência sem RLS usa `migrationBuilder.InsertData`, que não escreve SQL no C# e não precisa do helper `NO FORCE`/`FORCE` — onde se aplica: dados nacionais imutáveis semeados por migração (exceção do ADR 00004).
- Interceptor de auditoria com metadados opcionais falha aberto. Com um método explícito (`SalvarAuditadoAsync`) e o `SaveChanges` comum lançando diante de entidade auditável, nenhuma escrita sai sem quem e por quê — onde se aplica: toda entidade auditável do 00014 em diante.
- O índice único por expressão (`lower(nome)`) e parcial não é expresso pelo EF: vai por `migrationBuilder.Sql` e fica fora do modelo, então o `has-pending-model-changes` não o vigia. Só o teste de banco o protege — onde se aplica: toda unicidade por expressão.

## Gate do orquestrador (25/10/2026)

Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR:

- Plano aprovado como está, sem dividir de saída. A linha de corte no E3 fica valendo: se o checkpoint depois do E2 passar de 1,5× o previsto, o E3 vira o 00013b.
- `especialista-obra` dispensado neste ciclo. O único gatilho dele seria o CSV da trilha de auditoria, que é um dado técnico e não um número de obra. Fica registrado como dispensa no ciclo.
- O ADR novo é o 00009. O 00007 e o 00008 continuam reservados conforme o PLANO.
- Os 27 códigos de UF serão conferidos pelo orquestrador contra a tabela IBGE conhecida (11 RO … 53 DF) na revisão. Mesmo assim, ficam como pendência V-1 do usuário: conferir numa fonte oficial antes do merge.
- Início: só depois do push da branch `feat/00012-identidade-empresas`, com a branch `feat/00013-obras-auditoria` criada a partir do último commit dela.
