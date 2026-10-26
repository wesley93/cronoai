# 00006 - Isolamento entre empresas: coluna, filtro do EF, RLS e teste de rotas

**Data**: 2026-10-25
**Status**: Proposto (aceite do usuário pendente; PgBouncer em modo de transação, papel de backup e papel de limpeza em produção são da Infraestrutura; risco residual de `usuario` e retenção, do Jurídico)
**Spec/decisão relacionada**: SPEC-02 (RF-02.3b), SPEC-01 (RF-01.1), ASVS 5.0.0 V8, plano do ciclo 00012 (seções 3.5, 3.6, 3.9 e 07), pareceres do `dba` (`00011-tarefa0-dba.md` §2; `00012-tarefa0-dba.md`), `PLANO-FASE-2.md` §8.3

Classificação: opinião da equipe, salvo onde há link para a documentação. Nada aqui é exigência regulatória.

## Contexto
O CronoAI é multiempresa: um usuário da empresa A nunca acessa dado da empresa B. Um único mecanismo falha (filtro esquecido, `IgnoreQueryFilters`, SQL cru, job). A decisão é defesa em profundidade, com teste que obriga cada rota nova a declarar o cenário de isolamento.

## Decisão

### Camadas
1. **Coluna `empresa_id`** em toda tabela de dado de empresa (denormalizada, FK composta `(empresa_id, X)` a partir do 00013) e `IDadoDeEmpresa` no domínio.
2. **Filtro global nomeado `"Empresa"` do EF** ([doc](https://learn.microsoft.com/ef/core/miscellaneous/multitenancy), [filtros](https://learn.microsoft.com/ef/core/querying/filters)), aplicado automaticamente a todo `IDadoDeEmpresa`; sem empresa no contexto, nenhuma linha. Desligar só com `IgnoreQueryFilters(["Empresa"])`, **só em `ConsultasIdentidade.cs`** (regra R16).
3. **RLS do PostgreSQL** ([doc](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)) com `ENABLE` + `FORCE`, políticas **por comando** (nada de `FOR ALL`), todas **`TO cronoai_app`**, com `WITH CHECK` explícito em INSERT e UPDATE, lendo as variáveis por subconsulta escalar `(SELECT NULLIF(current_setting(nome, true), '')::uuid)`. Política para o migrador é **proibida** (anularia o `FORCE`). Helper único em `CronoAI.Dados/Rls/`.
4. **Nada de middleware terminal depois de `UseAuthorization`.** O tratador de resultado deixa passar a requisição SEM endpoint (rota inexistente) para o 404, porque o fallback também a avalia; um `Run`/`Map` de ramo depois da autorização a serviria sem autenticação. Rota nova é endpoint, com cenário no catálogo.
5. **Teste genérico de rotas**: enumera o `EndpointDataSource` e reprova rota sem cenário no catálogo versionado, rota anônima fora da lista, rota protegida sem 401, escrita sem antiforgery, e vazamento de dado da empresa B para o usuário da A.

### Contexto do banco imutável por `DbContext`
- `ContextoSessaoBanco(UsuarioId?, EmpresaId?)` é um record imutável entregue **no construtor** do `CronoDbContext` por `IFabricaCronoDbContext`. O `CronoDbContext` scoped dos endpoints sai da fábrica a partir do `ContextoSessao` da requisição, preenchido **uma vez** pelo validador de sessão (segunda atribuição lança exceção). Se algo resolver o contexto antes da validação, ele nasce vazio: zero linhas, nunca vazamento.
- **Empresa ativa só da sessão**, nunca do corpo, da URL ou de cabeçalho (`PLANO-FASE-2.md` §8.3).

### Variáveis de sessão e pool de conexões
- Um `DbConnectionInterceptor` singleton executa, em **toda** abertura, `set_config('app.usuario_id', @u, false)` e `set_config('app.empresa_id', @e, false)`: **sempre as duas, inclusive com texto vazio**, com os valores como parâmetros e os nomes como constantes ([doc](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-SET)). Assim a conexão reciclada nunca carrega o valor do dono anterior mesmo se o reset do Npgsql (`DISCARD ALL`, [doc](https://www.postgresql.org/docs/current/sql-discard.html)) falhar: o reset é a segunda rede, não a única. Modo de sessão (e não de transação) porque leituras do EF não abrem transação.
- **Guarda de partida**: a API não sobe com `No Reset On Close=true` ([doc](https://www.npgsql.org/doc/connection-string-parameters.html)).
- **Toda conexão passa pelo interceptor**: `NpgsqlConnection` e `NpgsqlDataSource` ficam proibidos em `server/src` fora do design-time (regra R17).
- **Provas por teste**: controle negativo (conexão crua com reset desligado **vaza**), sobrescrita independente do reset, conexão devolvida ao pool sem contexto, concorrência com pool pequeno (banco e API) e requisição que falha depois de abrir a conexão.
- **Limite honesto: a variável de sessão não é segredo.** Quem tem a credencial de `cronoai_app` e executa SQL livre escolhe a empresa. O RLS protege contra filtro esquecido e erro de código, não contra quem já executa SQL.
- **PgBouncer em modo de transação** (se a Infra vier a usá-lo) vaza variáveis de sessão entre clientes: exigiria trocar para `set_config(..., true)` com interceptor de transação. Pendência da Infraestrutura.

### Papéis, privilégios e políticas do 00012
| Tabela | Privilégios do `cronoai_app` | Políticas (todas `TO cronoai_app`) |
|---|---|---|
| `usuario` | SELECT, INSERT, UPDATE (sem DELETE) | sem RLS |
| `empresa` | SELECT, INSERT | SELECT: `id = E` ou membro; INSERT: `id = E` |
| `membro_empresa` | SELECT, INSERT | SELECT: `usuario_id = U` ou `empresa_id = E`; INSERT: `empresa_id = E` |
| `sessao` | SELECT, INSERT, UPDATE, DELETE | uma por comando, todas com `usuario_id = U` |
| `__ef_migrations_history` | nenhum | sem RLS, inacessível ao papel |

`U` e `E` são as subconsultas escalares das variáveis. Menor privilégio é do ciclo: o 00013 e o 00014 concedem o que usarem.

**Acrescentado no 00013** ([ADR 00009](00009-trilha-de-auditoria-append-only-e-concorrencia-da-obra.md)):

| Tabela | Privilégios do `cronoai_app` | Políticas (todas `TO cronoai_app`) |
|---|---|---|
| `obra` | SELECT, INSERT, UPDATE (sem DELETE: o "D" é arquivar) | SELECT: `empresa_id = E`; INSERT: `empresa_id = E`; UPDATE: `empresa_id = E` no `USING` e no `WITH CHECK` (impede mover a obra de empresa) |
| `auditoria` | SELECT, INSERT (sem UPDATE, DELETE nem TRUNCATE) | **só** SELECT e INSERT, ambas `empresa_id = E`; nenhuma política de UPDATE ou DELETE |
| `uf_referencia`, `municipio_referencia` | SELECT | **sem RLS** (listas nacionais globais, sem `empresa_id`); entram na lista global do teste de catálogo |

- **Padrão das políticas da trilha:** a ausência de política de UPDATE/DELETE é a camada 2 do append-only (as outras são o `REVOKE` e o gatilho de instrução). Os testes de política de escrita rodam **sem `WHERE` e sem `RETURNING`** (e, no UPDATE, sem ler coluna no `SET`): com eles o PostgreSQL aplica também a política de SELECT e ela mascararia um `USING`/`WITH CHECK` afrouxado.
- **FK composta ignora o RLS:** `fk_obra_responsavel (empresa_id, responsavel_id) → membro_empresa` garante que o responsável é membro DA MESMA empresa; membro de outra empresa e usuário inexistente dão o mesmo 400.

**Substituído e acrescentado no 00014** ([ADR 00010](00010-perfis-e-permissao-por-obra.md); predicados exatos no golden `Dados/predicados-esperados.txt`, copiado da saída real do `pg_policies`):

| Tabela | Privilégios do `cronoai_app` | Políticas (todas `TO cronoai_app`; `ADMIN`, `GESTOR` e `TODAS` são `EXISTS` do vínculo ATIVO do usuário do contexto) |
|---|---|---|
| `empresa` | SELECT, INSERT | SELECT: `id = E` ou membro **ativo** (`removido_em IS NULL`) |
| `membro_empresa` | SELECT e UPDATE só nas colunas `perfil`, `escopo_obras`, `removido_em`, `atualizado_em`; **sem INSERT** (escalada fechada) | SELECT inalterada; **política de INSERT removida**; UPDATE: `empresa_id = E` + gatilho `trg_membro_exige_administrador` (uma política de UPDATE que consultasse a própria tabela dispararia 42P17) |
| `obra` | SELECT, INSERT, UPDATE | SELECT e UPDATE: `empresa_id = E` e (`TODAS` ou obra vinculada ou obra de carteira atribuída e não arquivada); INSERT: `empresa_id = E` e `TODAS` |
| `acesso_obra`, `acesso_frente` | SELECT, INSERT, DELETE (sem UPDATE) | SELECT: próprio vínculo, `ADMIN` ou `GESTOR`; INSERT e DELETE: `ADMIN` ou gestor no alcance |
| `frente` | SELECT, INSERT, UPDATE | os três: `empresa_id = E` e `obra_id IN (SELECT id FROM obra)` |
| `carteira` | SELECT, INSERT, UPDATE | SELECT: `TODAS` ou carteira atribuída; escrita: `ADMIN` |
| `carteira_obra`, `acesso_carteira` | SELECT, INSERT, DELETE (sem UPDATE) | SELECT pela carteira (nunca pela obra: ver a regra de recursão); escrita: `ADMIN` |
| `auditoria` | SELECT, INSERT | SELECT: a da empresa (sem obra) só `ADMIN`; a da obra, pela visibilidade da obra; INSERT: `usuario_id = U` e obra visível |

- **Regra de recursão (42P17):** a política de uma tabela citada pela política de `obra` nunca cita `obra`, e nenhuma política de `membro_empresa` cita `membro_empresa`. O teste `Sem_recursao_em_nenhuma_tabela_nem_contexto` lê todas as tabelas e roda escritas sem efeito em cada tabela com política de escrita, sob 11 contextos, e um controle com política autorreferente prova que o 42P17 é real.
- **Mapeamento de erros:** obra sem vínculo → **404** (igual ao inexistente; diverge do 403 do critério da SPEC-02); ação fora da matriz → 403 `acao-nao-permitida`; a obra que deixa de ser visível entre o carregamento e a gravação faz a política da trilha recusar com 42501 (sem constraint nem tabela), e o serviço reconfere a visibilidade antes de responder 404.
- **Testes de política de escrita** (reforço): negativos sem `WHERE`, sem `RETURNING` e com `SET` constante, e um irmão `*_mutacao` para cada um: numa transação do superusuário que nunca confirma a política é afrouxada (ou o gatilho, desligado) e o mesmo DML passa a afetar as linhas proibidas.

### `FORCE` mantido e migração de dados
Com `FORCE` o dono (migrador) também se sujeita às políticas; como elas são `TO cronoai_app`, setar `app.*` **não** libera o migrador (teste `Dono_tambem_se_sujeita_ao_rls`). Logo, DML de migração em tabela com RLS afetaria **zero linhas sem erro**. Regra: toda migração de dados usa `ExecutarDmlComRls`, que alterna **na transação da migração** `NO FORCE` → DML (com filtro explícito por empresa) → `FORCE`; a DDL do PostgreSQL é transacional, então um erro desfaz também o `NO FORCE`. A regra R15 acusa DML em `Migrations/` fora do helper. Em produção o momento de aplicar (lock curto) é da Infraestrutura. DDL e checagens de FK e unicidade ignoram o RLS.

### `usuario` fora do RLS (aceito com condições)
O upsert do login e a busca por (emissor, sujeito) acontecem antes de existir `usuario_id`. Condições: acesso a `DbSet<Usuario>` restrito por teste de arquitetura (`ConsultasIdentidade.cs`, a semente e a declaração no contexto); colunas mínimas (sem e-mail); `REVOKE DELETE` (pseudonimização, quando o Jurídico definir, é `UPDATE`, nunca `DELETE`); **reavaliado no 00014: o RLS de `usuario` foi adiado ao 00014c** (junto do convite e das variáveis de login, depois do parecer da Segurança sobre a exposição do par emissor + sujeito dos colegas, Q6). A listagem de membros (00014) lê o nome de exibição por `ConsultasIdentidade.ListarMembrosAsync`, com filtro explícito por membro da empresa ativa. **Risco residual: o `cronoai_app` lê o nome de exibição e o par emissor + `sub` de usuários de todas as empresas; só o código protege essa tabela** (dado pessoal pseudonimizado; retenção e descarte com o Jurídico).

### Sequência dos fluxos de identidade (cada passo com o seu `DbContext`)
1. upsert do usuário (sem contexto); 2. limpeza das sessões do próprio usuário (`usuario_id`); 3. criar `sessao` (`usuario_id`); 4. "minhas empresas" e empresa ativa automática (`usuario_id`); 5. gravar `empresa_ativa_id` (`usuario_id`; a FK composta confere o vínculo e ignora o RLS); 6. validação por requisição (`usuario_id` do cookie, sem empresa); 7. endpoint de dado (`usuario_id` + `empresa_ativa_id` fixados no `ContextoSessao`).

### Mapeamento de erros (regra para os próximos ciclos)
- Recurso de outra empresa → **404** com corpo idêntico ao de "não existe" (o 403 revela que existe).
- Sem empresa ativa → 403 (`empresa-ativa-necessaria`).
- `42501` em INSERT é bug de servidor → 500 genérico em ProblemDetails, com log sem dado pessoal.
- **Regra para o 00013**: um `UPDATE` de recurso de outra empresa afeta zero linhas sob RLS e o EF lança `DbUpdateConcurrencyException`, que viraria **409** (errado). **Carregue a entidade pelo caminho filtrado antes** (404 se ausente) e só então atualize.

### Notas para os próximos ciclos
- **00014, `responsavel_id` e auditoria de membro (cumprido):** remover um membro que é responsável de obra (ou frente) ativa responde 409 `membro-responsavel` com os ids, até a responsabilidade ser reatribuída. `MembroEmpresa` e as 6 tabelas novas são auditáveis; a lista de exceções do teste "entidade de empresa é auditável ou exceção declarada" ficou só com `Sessao` e `Empresa`.
- **00014, remoção de membro (cumprido, por outro caminho):** a remoção é **lógica** (`removido_em`), então a FK de `sessao` não é tocada e o administrador não mexe na sessão de ninguém: a validação por requisição passa a exigir `removido_em IS NULL` e a sessão do removido cai na próxima requisição. **Índice parcial de `sessao` (pendência herdada): avaliado e mantido o completo** (`ix_sessao_empresa_ativa_id_usuario_id` só serve à checagem da FK pelo lado referenciador e a aplicação nunca apaga membro; o parcial `WHERE empresa_ativa_id IS NOT NULL` fica para o 00023 se uma consulta real o pedir).
- **00023**: limpeza de `sessao` em lote com papel ou política próprios (nunca `BYPASSRLS`) e índice `(expira_em)`; o `pg_dump` de backup local precisa do papel de bootstrap ou de `--enable-row-security`.
- Toda rota com `{id}` ganha um cenário `ComIdDeOutraEmpresa` no catálogo (`Isolamento/CatalogoRotas.cs`) **e declara o recurso real** (`RecursoAlheio`): o teste coloca no `{id}` um recurso EXISTENTE da empresa B, e um meta-teste confere que ele existe e é de B. Com um id aleatório o 404 viria por "não existir" e o teste passaria sem provar o isolamento (lacuna do 00012, fechada no 00013).

## Alternativas descartadas
| Alternativa | Motivo |
|---|---|
| Só o filtro do EF | Contornável por `IgnoreQueryFilters`, `FromSql`, job ou esquecimento |
| `ContextoSessao` scoped e mutável lido pelo interceptor | Conexão aberta antes da mudança ficaria com variáveis velhas |
| Pular o `set_config` com contexto vazio | O vazamento dependeria do reset do pool |
| `set_config(..., true)` por transação | Exigiria transação em toda leitura |
| Tirar o `FORCE` ou criar política para o migrador | Passaria a "funcionar" a API apontada para o migrador, sem RLS |
| RLS em `usuario` agora | Complexidade sem endpoint que a justifique; adiado ao 00014c (variáveis de login e de convite, parecer da Segurança) |

## Consequências
**Positivas:** o banco nega a linha mesmo com o filtro esquecido; rota nova sem cenário reprova o build; vazamento pelo pool provado por testes (controle negativo incluído).
**Negativas / trade-offs:** uma consulta a mais por requisição; migração de dados exige o helper; `usuario` legível entre empresas pelo papel da aplicação até o 00014c.
**Pendências:** PgBouncer, papel de backup e papel de limpeza em produção (Infraestrutura); retenção, pseudonimização e termos multiempresa (Jurídico).
