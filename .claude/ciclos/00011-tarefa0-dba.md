# Ciclo 00011, tarefa 0: parecer do dba sobre as convenções de banco

Data: 2026-10-25. Modo: LEVANTAMENTO (leitura de plano, specs e ADRs; nenhum banco consultado, nada gravado no repositório).
Fontes: `00011-backend-esqueleto-plano.md` (§03, §07, §08, §11), `PLANO-FASE-2.md` (§5.2, 5.3, 5.12, 8.3, 8.4), SPEC-01 §5 e §6, SPEC-02 RF-02.3b/02.4/02.5, SPEC-12 RF-12.6/12.9/12.10, SPEC-14, SPEC-15 RF-15.7/15.11, ADR 00001, 00003.
Legenda: **[prática]** = prática geral ou documentada, com link; **[opinião]** = escolha minha, discutível. Nenhum item é exigência regulatória. Pacotes e imagens citados precisam de revisão de segurança e de licença antes de produção (já previsto no plano §08/§13).
Limite: o que só o PostgreSQL real confirma (ex.: o que o `dotnet ef` emite na `Inicial`) vai marcado "conferir" e deve virar teste na implementação.

```
VEREDITO PARCIAL: AJUSTAR (convenções do plano corretas no geral; faltam 4 pontos de base que ficam caros depois: papéis, schema, imagem/locale e a senha do Testcontainers)
RESUMO:
- nomes: snake_case via EFCore.NamingConventions, tabelas no singular — OK [opinião], com 3 travas (§1.1)
- schema: `cronoai` próprio, não `public` — AJUSTAR [opinião forte: trocar depois mexe em todas as migrações]
- PK: uuid v7 gerado na aplicação — OK [opinião]; `auditoria.id` = bigint identity [opinião]
- tempo: timestamptz (instante UTC) / timestamp sem fuso (relógio da obra) / date / minutos int — OK, com testes de Kind
- dinheiro: numeric com precisão explícita (nunca `money`, nunca o default do EF) — OK, precisão a fixar (§1.5)
- concorrência: xmin como token da linha; versão do agregado (obra) é outra coisa — OK com ressalva (§1.6)
- multiempresa: empresa_id em toda tabela + filtro EF + RLS — RECOMENDO RLS (decisão formal no ADR 00006/00012); pré-requisito no 00011: papéis separados
- papéis: dois papéis já no 00011 (migrador dono × aplicação só DML) — AJUSTAR (o plano adia para o 00013)
- migrações: `database update` em dev, bundle/script idempotente para quem aplicar fora; `Inicial` com a base de privilégios — AJUSTAR
- imagem: `postgres:17` (Debian) com digest, não `-alpine` — AJUSTAR [opinião, §6]
- Testcontainers: usuário e senha aleatórios explícitos — AJUSTAR (o plano afirma que já são aleatórios)
MIGRACAO: só a `Inicial` (esboço em §4.2); nenhuma tabela de domínio
INDICES SUGERIDOS: nenhum neste ciclo. Convenções de índice para 00012+ em §1.7 e §3
```

---

## 1. Convenções de modelo (herdadas por 00012 a 00023)

### 1.1 Nomes
- **snake_case com `EFCore.NamingConventions`**: concordo [opinião]. Pacote mantido na organização do EF Core (Apache-2.0, a rever com o Jurídico). https://github.com/efcore/EFCore.NamingConventions e https://www.npgsql.org/efcore/modeling/table-column-naming.html
- **Singular** (`obra`, `tarefa`, `vinculo`, `auditoria`): confirmo, alinha com a SPEC-01 §5 [opinião]. Evitar palavras reservadas (`user`, `order`, `group`); `usuario` está livre. https://www.postgresql.org/docs/current/sql-keywords-appendix.html
- **Trava 1, histórico de migrações:** fixar `MigrationsHistoryTable("__ef_migrations_history", "cronoai")` em vez de depender do que o plugin faça com `__EFMigrationsHistory` (conferir na 10.x).
- **Trava 2, limite de 63 bytes** do identificador ([doc](https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS)): índices/FKs compostos longos podem estourar e o PostgreSQL trunca em silêncio. Nomear à mão os compostos longos e ter teste que lê `pg_class`/`pg_constraint` e reprova nome truncado ou duplicado.
- **Trava 3, unidade no nome** (regra do `dba.md`): `duracao_min`, `lag_min`, `folga_total_min`, `inicio_restricao_local`. A SPEC-01 §5 ainda diz `duracao_du`/`lag_du`; emenda já prevista para o 00015.
- **Enum/estado:** `text` + `CHECK (... IN (...))` com `HasConversion<string>()`, não `CREATE TYPE ... AS ENUM` (alterar enum em migração é doloroso) [opinião]. `text` em vez de `varchar(n)`: sem ganho de desempenho no PostgreSQL ([doc](https://www.postgresql.org/docs/current/datatype-character.html)); limitar por `CHECK (char_length(...) <= n)` quando o domínio exigir.
- **FKs sem cascata:** o EF cria `ON DELETE CASCADE` em relação obrigatória. Fixar `DeleteBehavior.Restrict` globalmente [opinião, forte]: excluir obra/empresa com trilha de auditoria e LGPD é decisão explícita, nunca efeito colateral.

### 1.2 Schema
- **Recomendo schema próprio `cronoai`** para tabelas e histórico (`HasDefaultSchema("cronoai")`) [opinião]:
  - dá alvo exato para `GRANT`/`REVOKE`/`ALTER DEFAULT PRIVILEGES` e para `pg_dump -n`;
  - não mistura com objetos de extensão que apareçam em `public`;
  - mover tudo depois é reescrever snapshot e migrações.
- `public` não é inseguro por si (desde o PostgreSQL 15 o `PUBLIC` perde `CREATE` em `public`); padrão seguro de uso em https://www.postgresql.org/docs/current/ddl-schemas.html#DDL-SCHEMAS-PATTERNS . Mesmo assim: `REVOKE CREATE ON SCHEMA public FROM PUBLIC` e `REVOKE ALL ON DATABASE ... FROM PUBLIC` no bootstrap.
- O schema nasce no **bootstrap** (superusuário, §6.4), não por migração: não depende do que o EF emita para modelo vazio (conferir).
- Custo: `ALTER ROLE cronoai_app SET search_path = cronoai`; SQL cru futuro (`FromSql`) deve qualificar o schema.

### 1.3 Chaves
- **UUID v7 gerado na aplicação**: concordo [opinião]. Ordenado no tempo (localidade de índice B-tree melhor que v4) e independe do PostgreSQL 18 (`uuidv7()` nativo; a 17 não tem). https://www.postgresql.org/docs/current/datatype-uuid.html
- **Ressalvas:** v7 **não é controle de segurança** (carrega o instante de criação, parcialmente previsível; a autorização é o controle, como já diz o PLANO-FASE-2 §8.3). Usar `ValueGeneratedNever()` e atribuir o id numa fábrica do domínio (`Guid.CreateVersion7()`), para o `CronoAI.Dominio` seguir sem EF; não depender do gerador implícito do provedor (conferir o padrão do Npgsql 10).
- **Exceção:** `auditoria.id` como `bigint generated always as identity` [opinião]: tabela só de inserção, índice compacto, facilita partição. Não usar o id como garantia de ordem de commit.
- `uid_msproject` `integer`, `UNIQUE (obra_id, uid_msproject)`, dado próprio, nunca PK (00015).
- **Integridade multiempresa na chave** [opinião]: `obra` com `UNIQUE (empresa_id, id)` e filhas com FK composta `(empresa_id, obra_id) -> obra (empresa_id, id)`. Impede no banco `tarefa` da empresa A apontar para obra da B. A SPEC-01 §5 só põe `obra_id` nas filhas: o 00015 acrescenta `empresa_id` (§2).

### 1.4 Tempo
| Dado | Tipo PostgreSQL | .NET | Observação |
|---|---|---|---|
| Instante real (`criado_em`, `em` da auditoria, `configurado_em`) | `timestamptz` | `DateTime` Kind=Utc ou `DateTimeOffset` offset 0 | Guarda UTC; o fuso só afeta exibição. Npgsql 6+ recusa `DateTime` não-UTC em `timestamptz` ([doc](https://www.npgsql.org/doc/types/datetime.html)) |
| Data de calendário (status, real, linha de base) | `date` | `DateOnly` | Nativo no Npgsql 6+/EF 8+ |
| Data-hora local da obra (restrição, prazo final: ADR 00003) | `timestamp without time zone` | `DateTime` Kind=Unspecified | Relógio de parede, sem conversão. Sufixo `_local` no nome [opinião] |
| Minutos de duração, lag, folga | `integer` | `int` | Inteiro puro (ADR 00003); 3.000 tarefas × 480 min cabe em `int` |
| Intervalo de horário do calendário (07:00–12:00) | `smallint` minutos desde 00:00 | `int` | [opinião] mais exato e alinhado ao motor que `time`; `TimeOnly` também serve, fechar no 00015 |

- **Nunca** `timestamptz` para o relógio da obra: converteria pelo fuso da sessão e reintroduziria o erro que o ADR 00003 descarta (obra em Manaus vista de São Paulo).
- Teste obrigatório na 1ª coluna `_local` (00015): gravar `2026-10-25T07:30`, reler idêntico com `Kind=Unspecified`, mesmo com `TZ` do processo diferente. Um `ValueConverter` normaliza o Kind.
- Relógio da aplicação por `TimeProvider` (testável); `DEFAULT now()` só como rede de segurança [opinião]. Fixar `timezone=UTC` no servidor local por higiene.
- `jsonb` para premissas versionadas: ok; `ToJson()` (EF 8+), sem consultar dentro do JSON em rota quente ([doc Npgsql](https://www.npgsql.org/efcore/mapping/json.html)).

### 1.5 Dinheiro e números
- `numeric`, nunca `money` (depende de locale; https://wiki.postgresql.org/wiki/Don%27t_Do_This) nem `double precision`. `decimal` .NET ↔ `numeric` sem perda ([doc](https://www.postgresql.org/docs/current/datatype-numeric.html)). Alinha com a PF-2.
- **Sem precisão default:** toda propriedade `decimal` com `HasPrecision` explícito, garantido por teste de arquitetura sobre o modelo (nasce no 00012; no 00011 só a regra no ADR) ([doc EF](https://learn.microsoft.com/ef/core/modeling/entity-properties#precision-and-scale)).
- **Precisão proposta** [opinião; confirmar com Controladoria e `especialista-obra` no 00015/00017]:
  - valor **digitado** em R$ (BAC, custo real, preço): `numeric(18,2)` se o front só aceita 2 casas; senão a escala que ele aceita;
  - valor **derivado e gravado** (PV/EV/AC de snapshot, quantidade × RUP): `numeric(20,6)`. O `CLAUDE.md` manda arredondar só na exibição e a PF-2 fixa a tolerância em R$ 0,000001; arredondar em 2 casas ao gravar quebraria a paridade e a importação do 00019;
  - percentual: casas conforme o front (verificar `pct_concluido` em `src/`), sem assumir inteiro.
- `NULL` × 0: custo real/avanço ausente é `NULL` só se o domínio distingue "não informado"; senão `NOT NULL DEFAULT 0`. Registrar por coluna no 00015 (risco de média e `SUM` que ignoram `NULL`).

### 1.6 Concorrência (`xmin` × `versao`)
- **`xmin` como token da linha**: confirmo [prática do provedor: https://www.npgsql.org/efcore/modeling/concurrency.html]. Zero código, correto sob concorrência, sem coluna própria. A forma de mapear mudou entre versões (conferir na doc da 10.x: propriedade `uint` com `IsRowVersion()` ou o método antigo, hoje marcado obsoleto).
- **Expor no DTO como `versao` opaca** (SPEC-01 §5 e PLANO 5.3 já falam em `versao` no corpo). O cliente não interpreta o número.
- **Limites do `xmin`** [prática do PostgreSQL]:
  - muda em **qualquer** `UPDATE`, mesmo sem mudança de valor (o interceptor não deve "tocar" linha à toa);
  - **não muda quando uma tabela filha muda**: o `xmin` da `obra` não acusa edição de `tarefa`;
  - restaurar `pg_dump` gera `xmin` novos: versões em mãos do cliente viram 409 (aceitável, documentar);
  - é `xid` de 32 bits: só igualdade, nunca ordenação.
- **Consequência para 00015/00021:** o "último resultado por obra invalidado pela versão" (PLANO 5.11 E4) e a escrita em lote de tarefas pedem **contador de agregado explícito** na `obra` (ex.: `versao_cronograma bigint`, incrementado na mesma transação do lote), não o `xmin` da obra. Decisão do 00015; registrar já no ADR 00004 que existem os dois conceitos.
- Teste no 00013: dois contextos, mesma linha, o 2º `SaveChanges` lança `DbUpdateConcurrencyException`; e a migração **não** cria coluna para `xmin` (conferir).

### 1.7 Índices (convenção)
- O PostgreSQL **não** indexa o lado referenciador da FK; o EF cria o índice por convenção, manter ([doc](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)).
- Filhas de obra: índice líder em `obra_id`; unicidades `(obra_id, uid_msproject)` e `(obra_id, numero)` (linha de base).
- Unicidade com coluna anulável (segredo por empresa ou por obra): `UNIQUE NULLS NOT DISTINCT` (PostgreSQL 15+, disponível na 17; https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS).
- Auditoria: §3.

---

## 2. Multiempresa: coluna + filtro EF × RLS

**Posição [opinião, com base em defesa em profundidade]:** adotar os **três** (coluna, filtro EF, RLS) nas tabelas de dado de empresa. RF-02.3b diz "nunca acessa" e o filtro do EF é contornável por `IgnoreQueryFilters`, `FromSql`, job ou esquecimento. A decisão formal é do ADR 00006 no 00012 (o plano da fase a deixa aberta; https://www.postgresql.org/docs/current/ddl-rowsecurity.html). O 00011 precisa fixar agora os **pré-requisitos**, para o 00012 não descobrir tarde que seus testes passam por engano.

### 2.1 Coluna
- `empresa_id uuid NOT NULL` em **toda** tabela de dado de empresa, inclusive filhas (`tarefa`, `vinculo`, `auditoria`, `snapshot`...), **denormalizado**, com a FK composta do §1.3. Custo: 16 bytes por linha. Ganho: RLS sem subconsulta por linha, `pg_dump`/descarte por empresa triviais, FK composta fecha o furo de integridade. A SPEC-01 §5 não lista `empresa_id` nas filhas: emenda no 00015.
- Fora do filtro (decidir no 00012): `usuario` (identidade global por emissor + `sub`; pode estar em mais de uma empresa), `empresa` (política por `id`), `membro_empresa` (política por `usuario_id` **ou** `empresa_id`, porque "minhas empresas" é consultado antes de existir empresa ativa).

### 2.2 Filtro global do EF
- Padrão de multitenancy do EF ([doc](https://learn.microsoft.com/ef/core/miscellaneous/multitenancy)); no EF Core 10 há *named query filters* que permitem desligar só o filtro de tenant (conferir).
- **`AddDbContextPool` com filtro que depende de estado por requisição** exige reset cuidadoso; preferir `AddDbContext` (o pool de conexões do Npgsql continua).
- `IgnoreQueryFilters` fora de lista permitida deve reprovar no `validar-regras.mjs` (regra do 00012).

### 2.3 RLS: o que precisa ser verdade
Fatos do PostgreSQL ([doc](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)) que exigem decisões já no 00011:
1. **Superusuário e papéis com `BYPASSRLS` ignoram RLS. O dono da tabela também, a menos que haja `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.**
2. **O superusuário do contêiner (`POSTGRES_USER`) é o que Testcontainers e compose usam por padrão.** Se os testes de isolamento (00012) e de append-only (00013) rodarem com ele, **passam sem provar nada**. A fixture do 00011 já deve criar os papéis e a `ApiFactory` já deve conectar como `cronoai_app` (§2.4).
3. RLS habilitada sem política nega tudo (falha fechada).
4. A política lê a empresa de uma variável de sessão (nome sugerido `app.empresa_id`) com `NULLIF(current_setting(nome, true), texto vazio)` convertido para uuid. O `NULLIF` evita erro de cast quando a variável volta vazia após reset do pool; sem a variável a comparação é com `NULL`, ou seja, nenhuma linha. Escrever como subconsulta escalar `(SELECT ...)` para o planner avaliar uma vez.
5. **Setar a variável com o pool do Npgsql:** `set_config` com a empresa como **parâmetro** (nunca interpolado), num `DbConnectionInterceptor` ao abrir a conexão, com a empresa vinda da sessão (nunca do corpo). O Npgsql reseta a sessão ao devolver a conexão ao pool (`DISCARD ALL`, desde que `No Reset On Close` não esteja ligado). Teste: duas requisições seguidas de empresas diferentes na mesma conexão não vazam. Alternativa por transação (`set_config` com o 3º argumento `true`) é mais segura contra vazamento, mas exige toda leitura dentro de transação.
6. Jobs em segundo plano (Fase 3) setam a empresa por unidade de trabalho; **não** criar papel `BYPASSRLS` para eles.
7. **Teste de catálogo:** para toda tabela do schema `cronoai` com coluna `empresa_id`, exigir `pg_class.relrowsecurity` e `relforcerowsecurity` verdadeiros e ao menos uma política em `pg_policies`. Tabela nova sem RLS reprova o build, como o teste genérico de rotas.
8. Aplicar RLS por helper único em `CronoAI.Dados` (`migrationBuilder.HabilitarRlsPorEmpresa("tarefa")`), porque o snapshot do EF não conhece política (vai em `migrationBuilder.Sql`).
- Desempenho: medir no 00015 (RNF-01.1, leitura de 3.000 tarefas, p95 abaixo de 300 ms).

### 2.4 Papel da aplicação com menor privilégio (**antecipar para o 00011**)
O plano diz "00011: um papel só; separação no 00013". **Recomendo antecipar**: RLS (00012) e append-only (00013) dependem de dono diferente da aplicação, e o 00011 define a string de conexão, o bootstrap e a fixture que os demais ciclos herdam.

| Papel | Atributos | Faz |
|---|---|---|
| bootstrap (`POSTGRES_USER`) | superusuário, só local | cria banco, papéis e schema na 1ª subida; **a aplicação nunca usa** |
| `cronoai_migrador` | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`; dono do schema `cronoai` | `dotnet ef database update`, bundle, `MigrateAsync` dos testes |
| `cronoai_app` | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`; dono de nada | `USAGE` no schema; `SELECT/INSERT/UPDATE/DELETE` nas tabelas e `USAGE` nas sequências por `ALTER DEFAULT PRIVILEGES`; **sem DDL** |

- Duas strings: `ConnectionStrings:Cronoai` (app: API e testes) e `ConnectionStrings:CronoaiMigracao` (migrador: factory de design-time, `dotnet ef`, fixture). Nenhuma com senha no repositório.
- Docs: https://www.postgresql.org/docs/current/ddl-priv.html , https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html , https://www.postgresql.org/docs/current/sql-createrole.html
- O plano já proíbe `Migrate()` na partida; o papel sem `CREATE` torna isso **impossível**, não só proibido (prática geral; https://learn.microsoft.com/ef/core/managing-schemas/migrations/applying).
- `ALTER DEFAULT PRIVILEGES` vale para objetos criados pelo papel que o executou (ou `FOR ROLE`): rodar como `cronoai_migrador`.
- Uma migração que cita `cronoai_app` falha em ambiente sem o papel. **Aceito e desejável** (falha ruidosa, não silenciosa). Nome do papel como constante documentada no ADR 00004.

---

## 3. Auditoria append-only (fechar no 00013; convenções agora)

Garantia em camadas [prática do PostgreSQL: https://www.postgresql.org/docs/current/ddl-priv.html e https://www.postgresql.org/docs/current/plpgsql-trigger.html]:
1. `REVOKE UPDATE, DELETE, TRUNCATE ON cronoai.auditoria FROM cronoai_app;` **depois** do `ALTER DEFAULT PRIVILEGES` (que concederia DML geral). Teste com a conexão do `cronoai_app`: `UPDATE`, `DELETE` e `TRUNCATE` falham com SQLSTATE `42501`.
2. Gatilho `BEFORE UPDATE OR DELETE ... FOR EACH ROW` que levanta exceção, **e** `BEFORE TRUNCATE ... FOR EACH STATEMENT` (gatilho de `TRUNCATE` só existe por comando).
3. `FORCE ROW LEVEL SECURITY` com políticas de `SELECT` e `INSERT` por empresa e **sem** política de `UPDATE`/`DELETE`.
- **Limite honesto:** superusuário e dono podem desligar gatilho ou mudar privilégio. "Garantido no banco" vale **contra a aplicação**, não contra quem administra o banco. Evidência contra adulteração por administrador (hash encadeado, exportação imutável) é decisão de **Segurança/Infra**, fora do 00013.
- **Allowlist, não denylist:** o interceptor grava `antes/depois` só de propriedades marcadas como auditáveis. Uma coluna de segredo nova nunca entra na trilha por esquecimento (RF-15.11: "sem o segredo").
- **LGPD × append-only:** sem FK de `auditoria.usuario_id` para `usuario` com efeito de exclusão. Pseudonimização na linha de `usuario` (anonimizar nome/e-mail mantendo o `uuid`), nunca editando a trilha. `ip` como `inet`. IP e usuário são dado pessoal: retenção e descarte são do **Jurídico** (já no PLANO 5.3 e 10).
- **Índices** (00013): `(empresa_id, em DESC)`, `(obra_id, em DESC)`, `(entidade, entidade_id, em DESC)` e, se crescer, `BRIN (em)` (tabela só de inserção tem correlação natural com o tempo; https://www.postgresql.org/docs/current/brin.html). Medir antes de criar os três.
- **Particionar por mês: não agora** [opinião]. A documentação aponta ganho quando a tabela passa da memória do servidor (https://www.postgresql.org/docs/current/ddl-partitioning.html). Custos: PK/único precisam incluir a chave de partição (`(id, em)`); criar partição futura exige rotina (não há jobs até a Fase 3); descartar partição antiga (descarte LGPD) conflita com append-only e pede um terceiro papel. Estimar linhas/mês no 00015 (um lote de 3.000 tarefas gera milhares de linhas). Se for particionar, melhor nascer particionada no 00013 do que converter depois: **decisão a fechar no plano do 00013, com estimativa de volume**.
- Um lote grande não deve virar um `jsonb` de megabytes: uma linha por entidade alterada, com limite (conferir no 00015).

---

## 4. Migrações EF, migração `Inicial`, seed

### 4.1 Como aplicar
| Forma | Uso | Nota |
|---|---|---|
| `dotnet ef database update` (ferramenta local fixada) | só desenvolvimento local, com a string do **migrador** | [prática; https://learn.microsoft.com/ef/core/managing-schemas/migrations/applying] |
| `MigrateAsync()` na fixture | testes | idem |
| `dotnet ef migrations script --idempotent` | revisão por humano e uso por quem aplica fora (Infra) | o PostgreSQL tem DDL transacional, então um script falho não deixa meio-estado; operação com `CONCURRENTLY` precisa de `suppressTransaction: true` |
| `dotnet ef migrations bundle` | automação (pipeline) quando houver ambiente | executável autocontido; recebe a conexão por parâmetro ou variável |
- Concordo com o plano: **nunca na partida da API**. O EF 9+ protege migrações concorrentes com trava no Npgsql (conferir na 10.x); mesmo assim, o papel `cronoai_app` sem DDL é a garantia real.
- Qual forma a Infra vai usar é decisão dela: pendência do plano §13, sem propor ferramenta de deploy.
- **Ajuste na CI:** a `IDesignTimeDbContextFactory` do plano falha sem `ConnectionStrings__Cronoai`, e o passo `dotnet ef migrations has-pending-model-changes` roda na CI **sem segredo**. Resolver com string **fictícia sem senha** definida no próprio job (host `localhost`, banco `cronoai`, usuário `ef_design`), e conferir que o comando não abre conexão (só constrói o modelo). Sem valor padrão com senha na factory.
- Mantenho do plano: migração nova por mudança, nunca editar migração aplicada, teste `Modelo_sem_mudanca_pendente`.

### 4.2 Migração `Inicial`
O plano a quer **vazia**. Prefiro **não vazia**, com a base de privilégios (conferir o que o EF emite para modelo vazio). Esboço do `Up()` via `migrationBuilder.Sql`, rodado pelo `cronoai_migrador`; roles, banco e schema já existem (bootstrap, §6.4):
```sql
GRANT USAGE ON SCHEMA cronoai TO cronoai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA cronoai
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cronoai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA cronoai
  GRANT USAGE, SELECT ON SEQUENCES TO cronoai_app;
-- Down(): os REVOKE equivalentes.
```
Vantagem: privilégios versionados e **testados** (o teste do §4.3 prova que o papel da aplicação funciona e não faz DDL), e a `Inicial` deixa de ser arquivo sem efeito. Alternativa aceitável: `Inicial` vazia com os `GRANT` no bootstrap, **desde que** o teste do §4.3 exista.

### 4.3 Testes adicionais para o 00011 (além dos 15 do plano)
1. `Papel_da_aplicacao_nao_e_superusuario_nem_bypassrls` (consulta `pg_roles` por `rolsuper`, `rolbypassrls`, `rolcreatedb`, `rolcreaterole` do usuário corrente).
2. `Papel_da_aplicacao_nao_cria_objeto` (`CREATE TABLE` em `cronoai` e em `public` falha com `42501`).
3. `Historico_de_migracoes_no_schema_cronoai` (existe `cronoai.__ef_migrations_history`).
4. `Identificadores_cabem_em_63_bytes` (pode esperar a 1ª tabela, 00012).
5. `Sessao_da_aplicacao_usa_search_path_cronoai`.
O `Reaplicar_migracoes_nao_altera_o_banco` do plano roda com a conexão do migrador; a `ApiFactory` e os `Ready_*` com a do app.

### 4.4 Seed só de desenvolvimento
- **Nada de seed em migração** (migração roda em todo ambiente) [prática]. Evitar também `HasData` para dado de teste.
- Dado de **referência estável** (ex.: lista de perfis, se virar tabela) vai em migração, idempotente (`ON CONFLICT DO NOTHING`).
- Dado de **desenvolvimento** (empresa/obra de exemplo): comando explícito (por exemplo `dotnet run -- seed-dev`, ou classe chamada só se `IsDevelopment()` **e** flag de configuração ligada), idempotente, só dados **fictícios** (Inviolável 6), usando o papel `cronoai_app` e passando por RLS (setando a empresa). Fora de `Development`, recusa. De 00012 em diante; o 00011 não precisa de seed.
- O "usuário de desenvolvimento" do 00012 é da aplicação, não linha de banco semeada por padrão.

---

## 5. Segredos de integração cifrados (00022; convenções agora)

Concordo com o desenho do PLANO-FASE-2 §8.4 (Data Protection, chave fora do banco, sem `PersistKeysToDbContext`). Esboço de tabela para o 00022 [opinião]:

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` (v7) | |
| `empresa_id` | `uuid NOT NULL` | RLS |
| `obra_id` | `uuid NULL` | segredo por empresa ou por obra (RF-15.13) |
| `conector` | `text NOT NULL` | código do catálogo (em código), `CHECK` de formato |
| `campo` | `text NOT NULL` | ex.: `token`, `webhook_segredo` |
| `valor_cifrado` | `bytea NOT NULL` | saída de `IDataProtector.Protect(byte[])` (a sobrecarga de `byte[]` evita base64); `CHECK (octet_length(valor_cifrado) > 0)` |
| `configurado_em`, `configurado_por` | `timestamptz`, `uuid` | "configurado em {data} por {usuário}" |
| `expira_em` | `timestamptz NULL` | RF-15.7 |
| restrição | `UNIQUE NULLS NOT DISTINCT (empresa_id, obra_id, conector, campo)` | PostgreSQL 15+ |

- O *purpose* do Data Protection (`empresa_id` + `conector` + `campo`) é **derivado**, não guardado. O identificador da chave já vai dentro do blob cifrado: sem coluna `versao_chave`. Texto cifrado copiado entre linhas ou empresas não decifra com outro *purpose* ([doc](https://learn.microsoft.com/aspnet/core/security/data-protection/consumer-apis/purpose-strings)).
- Segredo **nunca** em DTO de saída: modelar `valor_cifrado` fora das projeções de leitura (entidade ou projeção sem a coluna). Trocar = `UPDATE` do `valor_cifrado` (substituir, não editar), com auditoria sem o valor. Não guardar versões antigas do cifrado.
- **Anel de chaves** ([armazenamento](https://learn.microsoft.com/aspnet/core/security/data-protection/implementation/key-storage-providers), [cifra em repouso](https://learn.microsoft.com/aspnet/core/security/data-protection/implementation/key-encryption-at-rest)):
  - **`SetApplicationName("CronoAI")` fixo.** Sem isso o isolamento padrão usa o caminho do conteúdo da aplicação, e trocar de pasta ou ambiente deixa tudo ilegível (vale também para os cookies do 00012). Registrar no ADR 00004 agora.
  - **Dev:** `PersistKeysToFileSystem` em pasta **fora do repositório** e do contexto do Docker (ex.: sob `%LOCALAPPDATA%`, configurável por variável), ou `server/.local/` com entrada no `.gitignore` **e** no `.dockerignore`. Anel sem proteção de chave é aceitável **só** local (o runtime avisa que as chaves ficam em claro). DPAPI só funciona em Windows (não em contêiner nem CI): não é o padrão.
  - **Testes:** `EphemeralDataProtectionProvider`, sem tocar disco.
  - **Produção:** onde ficam o anel e a chave mestra (certificado) é da **Infraestrutura**; a **Segurança** aprova o desenho. Eu só fixo a interface (`DataProtection:CaminhoAnel`, referência ao certificado por variável, **nenhum segredo em `appsettings`**). Não proponho provedor.
  - **Rotação:** o Data Protection gera chave nova a cada 90 dias por padrão e as antigas continuam decifrando (não revogar sem plano). Re-cifrar segredos (`Unprotect` + `Protect`) é rotina opcional futura. Rotação do certificado mestre: re-proteger o anel (Infra).
  - **Backup:** `pg_dump` **não** leva o anel. Restaurar o banco sem o anel torna os segredos irrecuperáveis (o administrador recadastra): já está no PLANO 8.4; repetir no `server/README.md` e no ADR 00008.
- No banco só existe texto cifrado: log de SQL do PostgreSQL ou parâmetro de EF nunca vê o segredo em claro (mais um motivo para `EnableSensitiveDataLogging` seguir proibido).

---

## 6. Testcontainers, compose local, pg_hba, senha

### 6.1 Imagem
- **`postgres:17` (Debian) com digest, não `-alpine`** [opinião]. A imagem Alpine usa musl e o suporte a locale/collation difere da glibc ([variantes no Docker Hub](https://hub.docker.com/_/postgres)): a **ordenação de texto acentuado (pt-BR)** e `ILIKE` podem diferir do banco gerenciado típico. Como `ORDER BY` de nome aparece em tela, é divergência silenciosa. Conferir; se o time preferir Alpine pelo tamanho, tornar a collation explícita.
- Fixar no `initdb` via `POSTGRES_INITDB_ARGS`: encoding UTF8 e collation decidida (ICU com `--locale-provider=icu --icu-locale=pt-BR`, PostgreSQL 15+, [doc](https://www.postgresql.org/docs/current/locale.html#LOCALE-PROVIDERS), ou `C.UTF-8`) **e registrar no ADR 00004**: mudar a collation depois exige reindexar. A collation de produção é da **Infraestrutura** (pendência).
- Mesma referência (tag + digest) no compose e na fixture. Versão 17 (suporte até nov/2029, [política](https://www.postgresql.org/support/versioning/)) confirmada como P3.

### 6.2 Testcontainers: **a premissa do plano está imprecisa**
O plano (§03 "Segredos" e P2) diz que o Testcontainers gera credenciais descartáveis ou aleatórias. Pelo que conheço da API do `Testcontainers.PostgreSql` 4.x, **usuário, senha e banco padrão são fixos** (`postgres`/`postgres`/`postgres`) e a porta do contêiner é publicada numa porta aleatória do host, sem restrição à interface local por padrão (conferir na versão adotada). Ajustes:
- `.WithUsername`, `.WithPassword` (valor aleatório por execução, ex.: GUID) e `.WithDatabase` explícitos;
- depois de subir, a fixture roda o **mesmo bootstrap** do compose (cria `cronoai_migrador`, `cronoai_app`, schema) como superusuário e entrega ao teste as duas strings (migrador e app), com senhas aleatórias;
- a conexão de superusuário só existe dentro da fixture;
- o teste do §4.3 confirma que a API **não** usa o superusuário.

### 6.3 Isolamento entre testes
Um contêiner por coleção, migrar **uma vez**, e cada teste cria a **sua empresa** com ids novos (sem `TRUNCATE`, o que também exercita o isolamento). Para suítes que precisem de banco limpo por teste, `CREATE DATABASE ... TEMPLATE <migrado>` é rápido ([doc](https://www.postgresql.org/docs/current/manage-ag-templatedbs.html)); `CREATEDB` só no papel de bootstrap da fixture.

### 6.4 Compose local (perfil `backend`)
- Concordo com porta só em `127.0.0.1`, `no-new-privileges`, `cap_drop`, `read_only` + `tmpfs`, volume nomeado, `pg_isready`, senha obrigatória por variável. Os mínimos de capability da lista (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID`) são os que a entrada da imagem costuma pedir; conferir ao subir.
- **pg_hba** ([doc](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html)):
  - **nunca** definir `POSTGRES_HOST_AUTH_METHOD=trust`;
  - o padrão da imagem com senha definida exige `scram-sha-256` nas conexões TCP (conferir na tag adotada com `SHOW password_encryption` e `SELECT * FROM pg_hba_file_rules` como superusuário; anexar a saída à matriz da tarefa 9);
  - o socket local dentro do contêiner é `trust` (padrão da imagem) e só atinge quem tem `docker exec`: aceitável em desenvolvimento;
  - `command` do serviço com `-c timezone=UTC` e `-c log_statement=none` (mínimo de higiene de log).
- **Senhas:** `.env` (já ignorado) com **três** variáveis só locais, sem valor de exemplo: `CRONOAI_DB_SENHA` (bootstrap), `CRONOAI_DB_SENHA_MIGRADOR`, `CRONOAI_DB_SENHA_APP`. `.env.example` só com nomes e marcador. O compose usa a forma obrigatória `${VAR:?mensagem}` (já prevista).
- **Bootstrap:** script em `/docker-entrypoint-initdb.d` (montado somente leitura), executado **só em volume vazio**. Usar `.sh` chamando `psql -v ON_ERROR_STOP=1` com as senhas passadas por `-v` e referenciadas como variável psql entre aspas (`:` + nome entre aspas simples, que faz o quoting correto); **não** usar bloco `DO` com dollar-quoting para isso, porque o psql não interpola variável dentro dele. Conteúdo: `CREATE ROLE` ×2 com os atributos do §2.4, `CREATE SCHEMA cronoai AUTHORIZATION cronoai_migrador`, `ALTER ROLE cronoai_app SET search_path = cronoai`, `REVOKE ALL ON DATABASE ... FROM PUBLIC`, `REVOKE CREATE ON SCHEMA public FROM PUBLIC`, `GRANT CONNECT ON DATABASE ... TO` os dois papéis. Fica em `server/` (ex.: `server/db/bootstrap/`) e é a **mesma fonte** da fixture. Não é "DDL solto": é provisionamento local de papéis e schema, e o ADR 00004 deve dizer isso; toda DDL de tabela continua só em migração.
- Consequência: recriar papéis exige `docker compose --profile backend down -v` (documentar no `server/README.md`).
- **Npgsql na string de conexão:** manter `Include Error Detail` desligado (padrão; só em `Development`, porque a mensagem de erro pode trazer valores de linha), `Timeout` e `Command Timeout` explícitos, `Maximum Pool Size` finito. `Ssl Mode` desligado só no local; em ambiente real é decisão da Infra (TLS, RF-12.7).

---

## 7. Riscos e CONHECIMENTO NOVO

Riscos (volume, varredura, divisão por zero e NULL × 0 não se aplicam: sem tabela neste ciclo):
- Principal: **teste de segurança que passa por engano** com superusuário (RLS, REVOKE, DDL). Mitigado pelo ajuste de papéis.
- Mudança de schema, collation ou precisão depois que houver dados. Mitigado fixando agora no ADR 00004.
- `xmin` usado como "versão da obra" (não acusa mudança de filha). Mitigado em §1.6.

CONHECIMENTO NOVO:
- Testcontainers (`Testcontainers.PostgreSql` 4.x): credenciais padrão fixas e conexão como superusuário; o plano 00011 supõe o contrário. Conferir na versão adotada antes de afirmar "credencial aleatória" em S-1.
- Superusuário e dono da tabela ignoram RLS (sem `FORCE`); superusuário ignora também `REVOKE`. Todo teste de isolamento e de append-only do CronoAI conecta como `cronoai_app`.
- `xmin` é por linha: não serve de versão de agregado (obra → tarefas). 00015/00021 precisam de contador explícito na `obra`.
- Imagem `postgres:*-alpine` (musl) pode ordenar texto acentuado diferente do banco gerenciado típico; decidir a collation e registrar (pendência de Infra).
- `IDesignTimeDbContextFactory` que exige `ConnectionStrings__Cronoai` quebra o `has-pending-model-changes` na CI sem segredo; a CI precisa de string fictícia sem senha.
- SPEC-01 §5: `vinculo` e demais filhas só têm `obra_id`, e `vinculo` não tem `id` nem `empresa_id`. O 00015 precisa de `empresa_id` (RLS e FK composta) e de chave primária definida (`id` uuid ou composta `(obra_id, pred_id, succ_id)`; atenção a vínculos duplicados no mesmo par com tipos diferentes).
- Auditoria "append-only no banco" vale contra a aplicação, não contra superusuário ou dono (limite a registrar no ADR do 00013).

Pendências com outras áreas (não decididas aqui): versão e collation do PostgreSQL e forma de aplicar migrações fora da máquina local (Infraestrutura); guarda do anel de chaves e da chave mestra em produção (Infra + Segurança); retenção e descarte de IP e usuário na trilha, pseudonimização (Jurídico); revisão de segurança e licença de `EFCore.NamingConventions`, `Npgsql.*`, `Testcontainers.*` e das imagens `postgres` e `testcontainers/ryuk` antes de produção (Segurança, Jurídico).

---

## Ajustes ao plano 00011 (lista para o VEREDITO)

1. **§07 Papéis:** antecipar a separação para o 00011: `cronoai_migrador` (dono do schema) e `cronoai_app` (só DML; sem superuser, createdb, createrole, bypassrls); duas strings de conexão (`Cronoai`, `CronoaiMigracao`); bootstrap em `server/db/bootstrap/` compartilhado por compose e fixture; API e testes de API usam `cronoai_app`. Atualizar §03 (Compose, Segredos), tarefas 2, 6, 7 e AC-2.
2. **§07 Schema:** `cronoai` (`HasDefaultSchema`); histórico `__ef_migrations_history` no mesmo schema por `MigrationsHistoryTable` explícito; schema criado no bootstrap.
3. **§07 Migração `Inicial`:** incluir `GRANT USAGE` e `ALTER DEFAULT PRIVILEGES` (ou, se ficar vazia, pô-los no bootstrap) e acrescentar à §11 os testes do §4.3 deste parecer.
4. **§03, §08, P2 Testcontainers:** corrigir a premissa de "credenciais aleatórias": usuário, senha e banco explícitos e aleatórios por execução; superusuário só na fixture; revisar a frase de S-1 e a linha da imagem `postgres`.
5. **§03 Compose e imagem:** trocar `postgres:17-alpine` por `postgres:17` (Debian) com digest (ou justificar Alpine e fixar a collation); `POSTGRES_INITDB_ARGS` com encoding e collation decididas e registradas no ADR 00004; `timezone=UTC`; vetar `POSTGRES_HOST_AUTH_METHOD=trust`; evidência de `pg_hba_file_rules` e `password_encryption` na matriz (tarefa 9); três variáveis de senha no `.env.example`.
6. **Tarefa 2 e CI (tarefa 10):** a factory de design-time não pode derrubar `has-pending-model-changes` na CI sem segredo: o job define string fictícia sem senha; conferir que o comando não conecta.
7. **ADR 00004, convenções a fixar (tabela do §1):** singular; snake_case; schema `cronoai`; PK `uuid` v7 gerado na aplicação com `ValueGeneratedNever` (`auditoria.id` bigint identity); FKs `Restrict`; `timestamptz` UTC × `timestamp` sem fuso (`_local`) × `date` × minutos `int`, com teste de `Kind`; `decimal` sempre com `HasPrecision` (digitado `numeric(18,2)`, derivado `numeric(20,6)`, a confirmar com Controladoria); enum como `text` + `CHECK`; `xmin` como token da linha exposto como `versao` opaca, contador de agregado explícito quando necessário; `empresa_id` denormalizado em toda tabela de empresa com FK composta; RLS por variável de sessão `app.empresa_id` como direção (decisão formal no ADR 00006); `SetApplicationName("CronoAI")` do Data Protection e anel fora do repositório; seed só por comando explícito em `Development`, nunca em migração.
8. **§07 Pendências:** registrar que a precisão de dinheiro e percentual e a escolha `time` × minutos do calendário fecham no 00015 com o `especialista-obra`, e que particionar `auditoria` fecha no plano do 00013 com estimativa de volume.

VEREDITO: AJUSTAR
