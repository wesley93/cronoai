# Ciclo 00013, tarefa 0: parecer do dba sobre obras, auditoria append-only e concorrência otimista

Data: 2026-10-25. Modo: LEVANTAMENTO (PLANO-FASE-2 §5.3 e §10; SPEC-01 §4-§5, SPEC-02 RF-02.4/02.5, SPEC-14 RF-14.3; ADR 00004; `backend-dotnet.md`; worktree `c12`: bootstrap, migrações `Inicial` e `IdentidadeEmpresas`, `CronoDbContext`, `ContextoSessaoInterceptor`, helpers `Rls/`; parecer 00012). Nenhum banco consultado, nada gravado no repositório.
Legenda: **[prática]** = documentado (link); **[opinião]** = escolha minha; **[exigência]** = requisito da SPEC ou do ADR. Nada aqui é exigência regulatória. "Conferir" = depende da versão real de Npgsql/EF 10 e vira teste.

```
VEREDITO: AJUSTAR (plano coerente; 4 ajustes: versao explícita em vez de xmin na obra, camadas extras no append-only, DELETE de obra x auditoria, município sem lista oficial)
RESUMO:
- obra(id v7, empresa_id, nome, uf, municipio_ibge, responsavel_id, data_status, sinapi_*, opcoes_cronograma jsonb, versao bigint, criada_em, atualizada_em, arquivada_em) — RLS FORCE — OK com ajustes (§1)
- auditoria(id bigint identity, empresa_id, obra_id, usuario_id, entidade, entidade_id, acao, antes/depois jsonb, origem, motivo, ip, correlacao_id, em) — RLS FORCE só SELECT/INSERT + REVOKE + gatilho de instrução — OK (§3)
- Concorrência: contador `versao` explícito na obra (gatilho BEFORE UPDATE), não xmin — diverge do plano E2 e converge com o ADR 00004; decisão do arquiteto/usuário (§2)
- Município: formato + prefixo da UF + dígito verificador; tabela `municipio_referencia` vazia, FK só depois da carga — LACUNA aceita, pendente PF (§4)
- uf_referencia (27 linhas) por migração: exceção à regra "seed fora de migração" (§4)
MIGRACAO: sim, `ObrasAuditoria` (esboço em §1 e §3)
INDICES SUGERIDOS: §1.3 e §3.4 (app DB)
```

## 0. Premissas e conflito entre documentos
- O plano (§5.3 E2) diz `xmin` como token. O ADR 00004 (Concorrência) diz: `xmin` como versão da linha **e** contador explícito na `obra` para a versão do agregado, "porque o `xmin` da obra não muda quando uma tarefa muda". O 00015 (`PUT /obras/{id}/tarefas` em lote com versão e 409) depende disso. Conclusão: o contador explícito tem de nascer na `obra` **agora**, senão o contrato HTTP (tipo e semântica de `versao`) quebra no 00015.
- SPEC-01 §5 lista `calendario_id`, `premissas`, `data_inicio` em `obra`; o plano do 00013 lista outros campos (SINAPI, opções do cronograma). `calendario_id` e `premissas` são do 00015 (tabelas ainda não existem): **não** criar coluna órfã agora.
- Escrita sob RLS em outra empresa afeta zero linhas sem erro (parecer 00012 §7): carregar pelo caminho filtrado, 404 se ausente, só então atualizar.

## 1. Modelo proposto: `obra`

### 1.1 Colunas, tipos e constraints (snake_case, schema `cronoai`, constraints nomeadas à mão, até 63 bytes)
| Coluna | Tipo | Nulo | Constraint / observação |
|---|---|---|---|
| id | uuid | não | PK `pk_obra`, v7 na aplicação (`ValueGeneratedNever`) |
| empresa_id | uuid | não | FK `fk_obra_empresa` → empresa(id) Restrict; `IDadoDeEmpresa`; **UNIQUE (empresa_id, id)** (`ux_obra_empresa_id_id`) para as FKs compostas do 00015 e da `auditoria` |
| nome | text | não | CHECK `char_length(nome) BETWEEN 1 AND 200` |
| uf | text | não | FK `fk_obra_uf` → uf_referencia(sigla) Restrict (§4) |
| municipio_ibge | text | não | CHECK `~ '^[0-9]{7}$'`; prefixo da UF (§4). `text`, não `integer`: é identificador, preserva zeros |
| responsavel_id | uuid | sim | FK composta `(empresa_id, responsavel_id)` → membro_empresa(empresa_id, usuario_id), MATCH SIMPLE. Ver Q4 |
| data_status | date | sim | `DateOnly` (ADR 00003/00004) |
| sinapi_uf | text | sim | FK → uf_referencia(sigla) |
| sinapi_regime | text | sim | CHECK `IN ('desonerado','nao_desonerado')` (enum = text + CHECK, ADR 00004) |
| sinapi_data_base | date | sim | CHECK `EXTRACT(day FROM sinapi_data_base) = 1` |
| (conjunto SINAPI) | | | CHECK `ck_obra_sinapi_tudo_ou_nada`: `(sinapi_uf IS NULL) = (sinapi_regime IS NULL) AND (sinapi_uf IS NULL) = (sinapi_data_base IS NULL)` |
| opcoes_cronograma | jsonb | não | `DEFAULT '{}'`; CHECK `jsonb_typeof(...) = 'object'` e `octet_length(opcoes_cronograma::text) <= 16384`. Campos vêm do tipo de projeto do front (dev). Sem GIN |
| versao | bigint | não | `DEFAULT 1`, CHECK `versao >= 1`; incrementada por gatilho (§2) |
| criada_em | timestamptz | não | UTC, do `TimeProvider` (não `now()`, por causa do `RelogioTeste`) |
| atualizada_em | timestamptz | não | idem; CHECK `atualizada_em >= criada_em` |
| arquivada_em | timestamptz | sim | §1.4 |

SINAPI: SPEC-03 põe "UF, regime, data-base nas premissas" e SPEC-07 RF-07.3 diz que a obra escolhe UF/data-base/regime. Registrar **fonte única**: no 00013 vivem em `obra.sinapi_*`; o 00015 (premissas versionadas) não pode duplicá-los.

### 1.2 Esboço da migração (helpers `Rls/` existentes; E = `ExpressaoEmpresa`)
```
-- CreateTable uf_referencia, municipio_referencia, obra, auditoria (§3) ...
REVOKE DELETE ON cronoai.obra FROM cronoai_app;          -- sem DELETE físico (§1.4)
HabilitarRlsForcado("obra");
PoliticaSelect("obra","pol_obra_select","empresa_id = " + E);
PoliticaInsert("obra","pol_obra_insert","empresa_id = " + E);
PoliticaUpdate("obra","pol_obra_update","empresa_id = " + E, "empresa_id = " + E);
CREATE FUNCTION cronoai.obra_incrementa_versao() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog AS $$ BEGIN NEW.versao := OLD.versao + 1; RETURN NEW; END $$;
CREATE TRIGGER trg_obra_versao BEFORE UPDATE ON cronoai.obra
  FOR EACH ROW EXECUTE FUNCTION cronoai.obra_incrementa_versao();
```
- `WITH CHECK empresa_id = E` no UPDATE impede mover a obra de empresa. No EF, tratar `empresa_id` como imutável após a gravação (`PropertySaveBehavior.Throw`) [opinião].
- Mudar `uf`/`municipio_ibge` é permitido, mas auditado e com motivo (afeta feriados e SINAPI); a regra de recálculo é do 00015/00016. Não travar no banco.

### 1.3 Índices (app DB)
- PK `id` e UNIQUE `(empresa_id, id)` (cobre FKs compostas e a listagem por empresa, que RLS e filtro global sempre incluem). Nada mais: dezenas a centenas de obras por empresa; medir antes. Se a listagem por nome pesar: `(empresa_id, nome) WHERE arquivada_em IS NULL` [opinião].
- Se o EF gerar índices automáticos em `uf`/`sinapi_uf`, são dispensáveis (referência de 27 linhas, nunca apagada).

### 1.4 DELETE da obra x auditoria x LGPD (Q1)
O plano diz `CRUD /api/v1/obras`. `auditoria` referencia a obra (FK composta Restrict, convenção do ADR 00004) e é imutável: **DELETE físico de obra é impossível se houver auditoria**, e sempre haverá (a criação é auditada). Saídas:
1. **[recomendado, opinião]** "D" = **arquivar** (`arquivada_em`), `REVOKE DELETE` em `obra`. Listagem filtra `arquivada_em IS NULL` por padrão; o filtro global do EF **não** esconde arquivada (lida por id e pela auditoria). Restaurar = limpar `arquivada_em` (auditado). Exclusão definitiva é decisão do Jurídico e de procedimento próprio, nunca da API.
2. Sem FK de `auditoria` para `obra` (`obra_id` solto): permite apagar a obra e deixar a trilha órfã. Perde integridade e consistência de `empresa_id`; **não recomendo**.

## 2. Concorrência otimista: `xmin` x `versao` explícita

### 2.1 Comparação
| Critério | `xmin` | `versao bigint` (gatilho) |
|---|---|---|
| Natureza | coluna de sistema `xid` 32 bits, transação que gravou a linha [https://www.postgresql.org/docs/current/ddl-system-columns.html] | contador da linha: 1, 2, 3... |
| Estável em dump/restore | **não** (restore regrava xids; token em cache do cliente invalida) | sim |
| Semântica do agregado | **não**: tarefa muda, `xmin` da obra não | sim (00015 faz `UPDATE obra` na mesma transação) |
| Wraparound | 32 bits: token velho poderia coincidir após ~4 bilhões de transações (teórico) | não |
| EF/Npgsql | `Property<uint>("xmin").HasColumnType("xid").ValueGeneratedOnAddOrUpdate().IsConcurrencyToken()` (`UseXminAsConcurrencyToken` está obsoleto nas versões recentes; **conferir**); migração não cria a coluna [https://www.npgsql.org/efcore/modeling/concurrency.html] | `long Versao`, `IsConcurrencyToken()`, `ValueGeneratedOnAddOrUpdate()`; o gatilho calcula e o Npgsql lê de volta por `RETURNING` (**conferir** por teste) |
| Contrato HTTP | `uint` opaco | inteiro legível e monótono (útil na auditoria) |
| Custo | zero de DDL | 1 coluna + 1 gatilho O(1) |

### 2.2 Recomendação [opinião, apoiada no ADR 00004]
`obra.versao bigint` explícita, incrementada por gatilho `BEFORE UPDATE`. Razões: (1) o agregado precisa de versão que também mude quando filhos mudam (00015); trocar tipo/semântica depois quebra o contrato com o front; (2) estável em backup/restore; (3) o gatilho incrementa mesmo por caminho que esqueça (ExecuteUpdate, SQL de manutenção) e ignora valor enviado pelo cliente. `xmin` segue válido para entidade sem filhos. **Diverge do texto do plano E2: precisa do aceite do arquiteto e do usuário (Q2).**

### 2.3 Consequências para o EF/Npgsql
- Em READ COMMITTED (padrão), o 2º UPDATE concorrente espera o 1º, reavalia o `WHERE` na linha nova, não casa, afeta 0 linhas e o EF lança `DbUpdateConcurrencyException` [https://www.postgresql.org/docs/current/transaction-iso.html; https://learn.microsoft.com/ef/core/saving/concurrency]. Não precisa SERIALIZABLE.
- Definir `entry.Property(o => o.Versao).OriginalValue = dto.Versao` antes do `SaveChanges`; comparar também em memória após o carregamento (409 sem ir ao UPDATE), deixando o `WHERE` cobrir a corrida.
- A exceção tem 3 causas: (a) versão velha: **409 com estado atual** (`GetDatabaseValuesAsync`); (b) linha sumiu/invisível por RLS: valores nulos: **404**, nunca 409; (c) obra arquivada na corrida: 409 com o estado. Um teste para cada.
- Proibir `ExecuteUpdate`/`ExecuteDelete` sobre `obra` e `auditoria`: não passam pelo `ChangeTracker`/interceptor de `SaveChanges` [https://learn.microsoft.com/ef/core/saving/execute-insert-update-delete; **conferir** quais interceptores disparam]. Regra de arquitetura nova (R18 sugerida) + teste.

### 2.4 Contrato HTTP (opinião do dba; decisão do arquiteto)
- Corpo de escrita (`PUT`/`PATCH`) carrega `versao` (inteiro obrigatório; ausente = 400); GET/POST/PUT devolvem `versao`. Arquivar: `versao` no corpo do `POST .../arquivar` ou na query; evitar corpo em DELETE (semântica indefinida, RFC 9110 §9.3.5).
- Conflito: **409** com ProblemDetails (RFC 9457) e extensão `estadoAtual` (obra como está, com `versao`). 409 = conflito com o estado atual [https://www.rfc-editor.org/rfc/rfc9110#section-15.5.10]; `If-Match` falho é 412 [§13.1.1], coerente com a decisão do plano de não usar `If-Match`; a SPEC-01 RF-01.4 pede 409.
- Opcional: `ETag: "<versao>"` em respostas, só como cortesia de cache, sem exigir `If-Match`.
- `estadoAtual` só quando a obra é visível ao chamador (404 não vira 409; nada vaza entre empresas).

## 3. Auditoria append-only com garantia no banco

### 3.1 Tabela
| Coluna | Tipo | Nulo | Constraint / observação |
|---|---|---|---|
| id | bigint | não | `GENERATED ALWAYS AS IDENTITY`, PK (ADR 00004). INSERT do papel não exige USAGE extra na sequência (pertence à coluna; **conferir** por teste) |
| empresa_id | uuid | não | RLS; parte da FK composta |
| obra_id | uuid | sim | FK composta `(empresa_id, obra_id)` → obra(empresa_id, id) Restrict |
| usuario_id | uuid | não | FK → usuario(id) Restrict. Vem do contexto do banco, **nunca** do corpo da requisição |
| entidade | text | não | CHECK `~ '^[a-z_]{1,64}$'` |
| entidade_id | uuid | não | todas as PKs são uuid. Chave composta (ex.: `vinculo`, 00015) precisa de id substituto, ou vira `text`: avisar o 00015 |
| acao | text | não | CHECK `IN ('criar','alterar','arquivar','restaurar')`; ampliável por migração |
| antes / depois | jsonb | sim | `antes` nulo em `criar`; **só campos alterados**, de lista branca por entidade; CHECK `jsonb_typeof = 'object'` e `octet_length(::text) <= 262144` |
| versao_depois | bigint | sim | versão da entidade após a escrita |
| origem | text | não | CHECK `IN ('ui','importacao','whatsapp','api')` (RF-02.4) |
| motivo | text | sim | CHECK `char_length <= 500` (texto livre: risco de dado pessoal digitado; UI avisa) |
| ip | inet | sim | coluna **própria**, não no jsonb (§3.5) |
| correlacao_id | uuid | sim | id da requisição, para juntar com logs |
| em | timestamptz | não | `TimeProvider`, UTC |

- Não guardar: nome, e-mail, `emissor`/`sujeito`, user-agent, cabeçalhos, token, nem campo fora da lista branca. `usuario_id` é pseudônimo (uuid v7); o nome sai de `JOIN usuario` na leitura e some/pseudonimiza com `UPDATE` em `usuario` sem tocar a trilha.
- O identity **não** é monótono por commit (transações concorrentes, buracos; nextval não é transacional [https://www.postgresql.org/docs/current/functions-sequence.html]). Ordenar por `(em, id)`; exportação com keyset por `id`, declarando possíveis lacunas.

### 3.2 Três camadas independentes
| Camada | Sobre `cronoai_app` | Sobre o dono (`cronoai_migrador`) |
|---|---|---|
| 1. `REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM cronoai_app` (o default do `Inicial` concede SELECT/INSERT/UPDATE/DELETE, não TRUNCATE; revogar os três explicitamente e testar) [https://www.postgresql.org/docs/current/ddl-priv.html] | erro 42501 | nenhum |
| 2. RLS `FORCE` só com políticas de SELECT e INSERT (`TO cronoai_app`) [https://www.postgresql.org/docs/current/ddl-rowsecurity.html] | 0 linhas, sem erro | idem (FORCE, sem política para o dono) |
| 3. Gatilho **de instrução** `BEFORE UPDATE OR DELETE OR TRUNCATE ... FOR EACH STATEMENT`, `RAISE EXCEPTION`, `ENABLE ALWAYS` [https://www.postgresql.org/docs/current/sql-createtrigger.html] | erro, mesmo sem a camada 1 | **erro mesmo para o dono e com 0 linhas** (dispara antes do filtro de RLS e cobre TRUNCATE, que gatilho por linha não cobre) |

```
CREATE FUNCTION cronoai.auditoria_recusa_alteracao() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog AS $$
  BEGIN RAISE EXCEPTION 'auditoria é append-only' USING ERRCODE = 'restrict_violation'; END $$;
CREATE TRIGGER trg_auditoria_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON cronoai.auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION cronoai.auditoria_recusa_alteracao();
ALTER TABLE cronoai.auditoria ENABLE ALWAYS TRIGGER trg_auditoria_append_only;
```
- `ENABLE ALWAYS` mantém o gatilho com `session_replication_role = replica` [https://www.postgresql.org/docs/current/sql-altertable.html; https://www.postgresql.org/docs/current/runtime-config-client.html], parâmetro que `cronoai_app` não ajusta.
- **Limite honesto [prática]:** o dono pode `DROP/DISABLE TRIGGER` e `DROP TABLE`; superusuário contorna tudo. "Inclusive para o dono" vale contra DML, não contra DDL. Mitigações fora do banco: migrador só roda migração revisada; teste de catálogo (gatilho presente, `tgenabled = 'A'`, políticas e privilégios); regra de revisão que acusa migração futura citando `auditoria` + `TRIGGER`/`POLICY`/`GRANT`/`DROP`; backup e guarda da trilha: Infraestrutura/Segurança. Hash encadeado contra superusuário: **opinião, fora do escopo**.
- `cronoai_app` não recebe `TRIGGER`/`REFERENCES`/`TRUNCATE` (teste com `has_table_privilege`).

### 3.3 RLS por empresa
- `pol_auditoria_select TO cronoai_app USING (empresa_id = E)`; `pol_auditoria_insert WITH CHECK (empresa_id = E)`. Nada mais.
- A FK composta garante `obra.empresa_id = auditoria.empresa_id`; o WITH CHECK garante que nasce na empresa **ativa**.
- Quem lê a trilha de qual obra é regra de perfil (00014), no app; o banco só isola por empresa.
- `auditoria` implementa `IDadoDeEmpresa`; `DbSet<Auditoria>` só com `Add` (teste de arquitetura).

### 3.4 Gravação na mesma transação e índices
- `SaveChangesInterceptor` (**sync e async**) lê o `ChangeTracker` e adiciona as linhas ao **mesmo `DbContext`**: vão no mesmo `SaveChanges`, mesma transação implícita (lote tudo-ou-nada) [https://learn.microsoft.com/ef/core/logging-events-diagnostics/interceptors; https://learn.microsoft.com/ef/core/saving/transactions]. Nunca outro `DbContext` para auditar (outra conexão, outra transação, outro contexto de RLS).
- `versao_depois` só é conhecida após o UPDATE (gatilho): gravar `versao_original + 1` e **conferir por teste** que bate com o banco (ou omitir a coluna).
- Fluxo com transação explícita: a auditoria entra nela (00015); nunca `SaveChanges` auditado fora dela.
- Alternativa [opinião, descartada]: gatilho `AFTER` nas tabelas de negócio. Cobre SQL fora do app, mas não conhece IP/origem/motivo. Mantenho o plano + proibição de escrita fora do `SaveChanges` + teste "toda rota de escrita gera auditoria".
- Índices (app DB): PK `id`; `(empresa_id, em DESC, id DESC)` (listagem/exportação da empresa); `(empresa_id, obra_id, em DESC)` (histórico da obra). `(empresa_id, entidade, entidade_id, em DESC)` pode esperar o 00015. Sem GIN em jsonb. Volume: lote de 3.000 tarefas (00015) = até 3.000 linhas por requisição: diff de campos e teto de tamanho.

### 3.5 LGPD: o que a trilha guarda (sem decidir pelo Jurídico)
**Fatos de projeto [opinião]:** o ciclo grava sobre pessoa: `usuario_id` (pseudônimo), `ip` (dado pessoal, exigido pelo RF-02.4), `motivo` (texto livre) e, no jsonb, só campos da lista branca (obra não tem dado pessoal além de `responsavel_id`, uuid).
**Conflito de fundo:** append-only impede `UPDATE`/`DELETE`; pedido de titular e retenção por prazo pediriam alterar ou apagar. O desenho acomoda as saídas possíveis sem escolher:
1. pseudonimização por `UPDATE` em `usuario` (a trilha só guarda `usuario_id`): já funciona;
2. `ip` e `motivo` em colunas próprias: um procedimento futuro os anonimiza sem reescrever jsonb. Exigiria **exceção controlada ao append-only** (função `SECURITY DEFINER` de papel de privacidade, gatilho que a admita, registro da própria exceção) **ou** partição por período com descarte. **Não implementar agora**: prazo, base legal, truncar IP (/24, /48) ou anular, e quem executa são do **Jurídico** e da **Segurança**;
3. retenção por descarte de partição só existe se a tabela for particionada (§3.6).
- IP atrás de proxy: ler `X-Forwarded-For` só com proxies confiáveis configurados (`ForwardedHeadersOptions`), senão é falsificável: Segurança/Infra.
- **Validar com o Jurídico antes do piloto:** gravar IP (inteiro ou truncado), prazo de retenção, procedimento de titular. Não substituo o parecer deles.

### 3.6 Particionamento: **não agora [opinião]**
- Volume do piloto é pequeno; os índices `(empresa_id, em ...)` resolvem a leitura. O ADR 00004 já registra "não particionar agora".
- Custo de adiar: PK/UNIQUE de tabela particionada precisam incluir a chave (`em`): converter depois exige tabela nova + cópia + troca. Benefício exclusivo: **descarte de retenção por `DROP PARTITION`** (o gatilho de instrução não bloqueia DDL do dono) [https://www.postgresql.org/docs/current/ddl-partitioning.html].
- Gatilho de reavaliação: resposta do Jurídico sobre retenção **ou** tabela acima de ~50 milhões de linhas (ordem de grandeza, opinião; medir com `pg_total_relation_size`). Se o Jurídico exigir retenção por prazo, particionar **no 00013**, não depois (PK `(id, em)`, partições mensais criadas pelo migrador).

## 4. Validação de município sem baixar a lista do IBGE
**Estrutura (app DB, DDL em migração):**
- `uf_referencia(sigla text PK CHECK ^[A-Z]{2}$, codigo_ibge smallint NOT NULL, nome text NOT NULL, UNIQUE (sigla, codigo_ibge))`: 27 linhas; referência sem RLS e sem tenant; `SELECT` para `cronoai_app`, sem escrita pela app. Populada na migração com `INSERT ... ON CONFLICT (sigla) DO NOTHING`. **Exceção à regra do ADR 00004 "seed só por comando explícito"** (que mira dado de desenvolvimento): aqui é dado nacional imutável necessário à integridade; registrar a exceção no ADR. **O usuário confere os 27 códigos contra a tabela oficial do IBGE antes do merge**: eu os conheço de memória (RO 11 ... DF 53) e não os verifiquei numa fonte. Se preferir não semear por migração: tabela vazia e prefixo validado só no domínio (perde a FK).
- `municipio_referencia(codigo_ibge text PK CHECK ^[0-9]{7}$, uf text NOT NULL FK uf_referencia, nome text NOT NULL, UNIQUE (codigo_ibge, uf))`: **vazia**, sem RLS, SELECT para a app. Carga futura por comando administrativo explícito (fora da API) a partir do arquivo oficial **fornecido pelo usuário** (insumo PF), registrando fonte e versão da lista.

**Validação em camadas:**
1. **Banco, sempre:** CHECK de 7 dígitos; consistência com a UF por **coluna gerada** `municipio_uf_cod smallint` (expressão: se o texto tem 7 dígitos, os 2 primeiros convertidos para smallint, senão nulo; o `CASE` evita erro de cast antes do CHECK, pois a ordem de avaliação não é garantida) e **FK composta** `(uf, municipio_uf_cod)` → uf_referencia(sigla, codigo_ibge). **Conferir** que o EF/Npgsql mapeia a coluna gerada como somente leitura. Alternativa mais simples: validar o prefixo só no domínio C#.
2. **Domínio (C#), sempre:** dígito verificador (7º dígito): pesos 1,2,1,2,1,2 sobre os 6 primeiros; somar os algarismos de cada produto; `DV = (10 - soma % 10) % 10`. Conferi à mão com 2611606, 3550308 e 5300108 (DV 6, 8, 8). **Não tenho link oficial da regra**: o usuário confirma contra a lista do IBGE e o teste fixa os casos. Pega erro de digitação sem a lista.
3. **Existência na lista (FK `obra → municipio_referencia`): ADIADA** até a carga: `ALTER TABLE obra ADD CONSTRAINT fk_obra_municipio FOREIGN KEY (municipio_ibge, uf) REFERENCES municipio_referencia(codigo_ibge, uf) NOT VALID;` e depois `VALIDATE CONSTRAINT`. Antes de validar, listar com `LEFT JOIN` as obras com código fora da lista, para correção.

**Seed de teste (fixture, nunca migração):** 1 a 3 municípios **fictícios** em `municipio_referencia` do banco de teste, com nome marcado "TESTE", UF e DV válidos (ex.: `2699999`; recalcular o DV pela fórmula no teste), só para provar a FK pós-carga. Sem nome real na fixture.
**Pendente (usuário):** arquivo oficial de municípios (fonte, ano/versão, formato) e conferência dos 27 códigos de UF. Até lá a garantia "o município existe" **não existe**: formato, prefixo e DV barram digitação errada, mas um código inexistente passa se o DV coincidir (cerca de 1 em 10 dos códigos aleatórios).

## 5. Testes de banco obrigatórios (Testcontainers, `BancoPostgresFixture`; semente como `cronoai_app` com contexto)
Cada garantia tem **controle negativo** (prova que o teste detecta a falha que diz detectar).
| # | Teste | Verifica | Controle negativo |
|---|---|---|---|
| 1 | `Rls_obra_isola_empresas` | contexto A lê só obras de A; INSERT com `empresa_id` de B = 42501; UPDATE de obra de B sob A = 0 linhas; trocar `empresa_id` no UPDATE negado | mesma consulta como bootstrap/superusuário enxerga A e B (dados existem) |
| 2 | `Rls_auditoria_isola_empresas` | idem (SELECT e INSERT com WITH CHECK) | idem |
| 3 | `Dono_tambem_se_sujeita_ao_rls` (estender) | migrador sem contexto vê 0 linhas de obra e auditoria | superusuário vê as linhas |
| 4 | `Auditoria_app_nao_altera_nem_apaga` | UPDATE, DELETE, TRUNCATE como `cronoai_app` = 42501 | UPDATE sobre `obra` funciona (o harness consegue escrever) |
| 5 | `Auditoria_gatilho_recusa_ate_o_dono` | como migrador: UPDATE, DELETE, TRUNCATE falham com `restrict_violation`, inclusive com 0 linhas | tabela gêmea `auditoria_controle` (`CREATE TABLE (LIKE ...)` no teste, sem gatilho/REVOKE): o mesmo UPDATE passa |
| 6 | `Auditoria_gatilho_independe_dos_privilegios` | em transação revertida: `GRANT UPDATE, DELETE, TRUNCATE` ao app; os comandos ainda falham (gatilho); `ROLLBACK` | tabela gêmea: com o mesmo GRANT e sem gatilho, o comando passa |
| 7 | `Auditoria_catalogo` | `tgenabled = 'A'`; `has_table_privilege` falso para UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES e verdadeiro para SELECT/INSERT; `pg_policies` só SELECT e INSERT; dono = migrador; `__ef_migrations_history` inacessível ao app | mesmo teste em `obra`: UPDATE verdadeiro |
| 8 | `Obra_versao_incrementa_e_gera_409` | dois contextos leem versão n; A grava (n+1); B grava com n: `DbUpdateConcurrencyException` e, na API, 409 com `estadoAtual` e `versao = n+1`; nada gravado por B | B relê e grava: sucesso, versão n+2, uma auditoria |
| 9 | `Obra_concorrencia_paralela` | `Task.WhenAll` de 10 PUTs com a mesma versão: 1 sucesso, 9 conflitos, 1 auditoria `alterar` | versões sequenciais: todos passam |
| 10 | `Obra_409_x_404` | obra de outra empresa = 404 (nunca 409); inexistente = 404; `versao` ausente = 400; arquivada na corrida = 409 com estado | caminho feliz = 200 |
| 11 | `Auditoria_atomica_mudanca_falha` | `SaveChanges` com obra violando CHECK (nome vazio, UF fora de `uf_referencia`): **nenhuma** linha de obra nem de auditoria | com valores válidos, ambos presentes e `depois` igual ao estado lido |
| 12 | `Auditoria_atomica_auditoria_falha` | mudança válida em obra + auditoria inválida injetada (ex.: `acao` fora do CHECK): obra mantém versão e valores antigos | sem a falha injetada, obra mudou e a auditoria existe |
| 13 | `Auditoria_nao_grava_em_409` | conflito não deixa linha de auditoria | caminho feliz grava 1 |
| 14 | `Auditoria_so_campos_da_lista_branca` | jsonb sem nome/e-mail/emissor/sujeito; arquitetura: nenhum `ExecuteUpdate/ExecuteDelete`/SQL de escrita sobre `obra`/`auditoria`; `DbSet<Auditoria>` só com `Add`; toda rota de escrita gera auditoria | campo fora da lista, em entidade de teste, é descartado |
| 15 | `Obra_validacoes_de_dominio` | formato (6 e 8 dígitos, letras), prefixo x UF (23503), DV (domínio), SINAPI "tudo ou nada", data-base dia 1; fictício aceito; FK pós-carga (`NOT VALID` + `VALIDATE`) recusa código fora da lista | município válido passa |
| 16 | Existentes a estender | `Identificadores_cabem_em_63_bytes`, `Fks_do_schema_sao_restrict`, `Modelo_so_tem_fks_restrict`, privilégios por tabela | |
Fora do banco, mas do ciclo: a exportação CSV neutraliza células iniciadas por `=`, `+`, `-`, `@` **e também TAB (0x09) e CR (0x0D)** [https://owasp.org/www-community/attacks/CSV_Injection]; o plano lista só 4 caracteres. Teste com controle negativo (célula normal intacta). Exportação com keyset por `id`, nunca `OFFSET`.

## 6. Riscos e perguntas
**Riscos**
1. [exigência/ADR] Divergência xmin x contador no plano E2: resolver antes do plano do arquiteto (§2).
2. [prática] `ExecuteUpdate/ExecuteDelete` e SQL cru contornam interceptor e auditoria: regra R18 + teste.
3. [prática] Gatilho e `FORCE` não impedem DDL do dono nem superusuário: limite declarado; mitigação por revisão de migração e teste de catálogo.
4. [opinião] `responsavel_id` com FK Restrict para `membro_empresa` bloqueia a remoção do membro no 00014 enquanto for responsável: o 00014 precisa de reatribuição. Alternativa: `responsavel_nome` texto livre (como a Fase 1, RF-14.3) até o 00014.
5. [prática] Identity da auditoria não ordena por commit; há buracos.
6. [opinião] Volume da auditoria no 00015 (lotes de 3.000): diff de campos e teto de 256 KB por jsonb; medir.
7. [opinião] Município inexistente com DV coincidente passa até a carga da lista.
8. [prática] Revisão de segurança e licença antes de produção para qualquer pacote novo (nenhum previsto; se o CSV usar biblioteca, avaliar).
9. Retenção, anonimização, IP e exceção ao append-only: **Jurídico + Segurança** (§3.5).

**Perguntas ao usuário**
- Q1. "D" do CRUD de obras = arquivar (recomendado, com `REVOKE DELETE`) ou exclusão física (inviável com auditoria obrigatória)?
- Q2. Aceita `versao` explícita na obra (diverge do plano E2; converge com o ADR 00004)?
- Q3. Aceita a exceção ao ADR para semear 27 UFs em migração, e confere os códigos? Ou prefixo só no domínio?
- Q4. `responsavel_id` vinculado a membro já agora, ou texto livre até o 00014?
- Q5. Nome de obra único por empresa (entre não arquivadas)? Não imponho: "duplicar obra" (RF-14.1) gera nomes iguais.
- Q6. O Jurídico já tem posição sobre IP (inteiro ou truncado) e retenção da trilha? Se exigir retenção por prazo, particionar no 00013.
- Q7. Quando virá a lista oficial de municípios (fonte e versão)?
- Q8. `data_status` pode ser nula na criação da obra, ou o front sempre envia (hoje `statusDate` existe no meta)?

CONHECIMENTO NOVO:
- Gatilho de instrução (`FOR EACH STATEMENT`) cobre `TRUNCATE`, dispara com 0 linhas e para o dono, onde o RLS FORCE sem política mascara a recusa como "0 linhas". Com `REVOKE`, são camadas independentes.
- `xmin` não representa a versão do agregado (tarefa muda, obra não): o ADR 00004 já previa contador explícito na obra; o plano E2 divergia.
- `DELETE` físico de obra é incompatível com auditoria obrigatória e FK Restrict: o CRUD precisa de arquivamento.
- `ExecuteUpdate/ExecuteDelete` contornam o interceptor de auditoria: proibir por regra de arquitetura.
- O 7º dígito do código IBGE do município é verificador (módulo 10, pesos 1,2): valida digitação sem a lista (conferir com fonte oficial).
