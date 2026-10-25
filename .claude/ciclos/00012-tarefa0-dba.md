# Ciclo 00012, tarefa 0: parecer do dba sobre o modelo de identidade, empresas e RLS

Data: 2026-10-25. Modo: LEVANTAMENTO (plano `00012-identidade-empresas-plano.md` §03.5, §07, §11; base do 00011 lida na worktree `c11`: `server/db/bootstrap/01-papeis-e-schema.sh`, migração `Inicial`, `PapeisBanco.cs`, `CronoDbContextConfiguracao.cs`, `BancoPostgresFixture.cs`; parecer anterior `00011-tarefa0-dba.md`). Nenhum banco consultado, nada gravado no repositório.
Legenda: **[prática]** = documentado (link); **[opinião]** = escolha minha. Nada aqui é exigência regulatória. "Conferir" = depende da versão real de Npgsql/EF 10 e vira teste.

```
VEREDITO PARCIAL: AJUSTAR (desenho na direção certa; 5 pontos de rigor: RLS com pool, fluxos de identidade, privilégios, sessão e migração de dados sob FORCE)
RESUMO:
- usuario(id v7, emissor, sujeito, nome_exibicao, criado_em, ultimo_acesso_em, desativado_em) — UNIQUE (emissor, sujeito) — fora do RLS — ACEITO COM CONDIÇÕES (§3)
- empresa(id v7, nome, criada_em) — RLS FORCE — OK; sem UPDATE/DELETE para a aplicação neste ciclo
- membro_empresa(PK empresa_id+usuario_id) — RLS FORCE — OK; sem DELETE neste ciclo
- sessao(id v4, usuario_id, empresa_ativa_id, criada_em, expira_em, encerrada_em) — RLS FORCE por usuario_id — OK com CHECKs, CSPRNG e limpeza (§6)
- RLS com set_config(..., false) no pool: ACEITO, desde que o interceptor SEMPRE sobrescreva as duas variáveis (inclusive vazias), com guarda e testes (§1)
- FORCE: MANTER, com regra explícita para migração de dados e semente (§2)
- DeleteBehavior.Restrict por último, e-mail não guardado, 404 entre empresas: OK
MIGRACAO: sim, `IdentidadeEmpresas` (ajustes em §7; privilégios em §4)
INDICES SUGERIDOS: os do plano bastam (PKs, UNIQUE, (usuario_id) em membro_empresa e sessao). Nada extra antes de medir; (expira_em) só quando existir limpeza em lote
```

## 0. As 7 perguntas da §07, em uma linha cada

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Políticas e par `app.usuario_id`/`app.empresa_id` | Adequados, com 4 ajustes: `TO cronoai_app`, `WITH CHECK` explícito, comandos mínimos, interceptor sobrescrevendo sempre (§1, §4) |
| 2 | `usuario` fora do RLS | Aceito com condições; risco residual de dado pessoal entre empresas no nível do banco (§3) |
| 3 | FK composta da sessão e `MATCH SIMPLE` | Correta (ordem das colunas igual à PK); `empresa_ativa_id` nulo não confere, como desejado. Atenção ao 00014 (§5) |
| 4 | `REVOKE DELETE` | Sim, e ir além: revogar o que o código do ciclo não usa (§4) |
| 5 | uuid v4 da sessão | Confirmo a exceção; gerar com CSPRNG explícito (§6) |
| 6 | Subconsulta de `empresa` sobre `membro_empresa` | Funciona: a subconsulta da política respeita o RLS da tabela consultada e, como a política de `membro_empresa` não cita `empresa`, não há recursão (§4) |
| 7 | Reset do Npgsql 10 | Esperado `DISCARD ALL` por padrão, **conferir**; o desenho não deve depender disso (§1) |

---

## 1. Ponto 1: RLS com o pool do Npgsql

**Decisão [opinião, com prova por teste]:** manter `set_config(nome, valor, false)` (nível de sessão) no `DbConnectionInterceptor`, **não** `SET LOCAL`/transação. Leituras sem transação explícita são o caso comum no EF (conexão aberta e fechada por operação); o modo por transação exigiria `BEGIN`/`COMMIT` em toda leitura ou um interceptor de transação. Em troca, três condições obrigatórias:

1. **Sobrescrever sempre as DUAS variáveis em toda abertura, inclusive com contexto vazio** (valor vazio, nunca "pular o comando"). Assim uma conexão reciclada nunca carrega o valor do dono anterior **mesmo que o reset do Npgsql falhe ou esteja desligado**. O reset do pool (`DISCARD ALL`; parâmetro `No Reset On Close`, [doc Npgsql](https://www.npgsql.org/doc/connection-string-parameters.html)) vira a segunda rede, não a única.
2. **Guarda na partida:** a API recusa subir se a string de conexão tiver `No Reset On Close=true` (`NpgsqlConnectionStringBuilder.NoResetOnClose`). Teste de configuração.
3. **Contexto imutável por instância de `DbContext`.** O plano usa um `ContextoSessao` scoped e mutável, preenchido pelo validador de sessão. Risco: o contexto muda depois de a conexão já estar aberta (transação em andamento) e as variáveis ficam velhas. Ajuste: o `CronoDbContext` recebe o contexto **no construtor** (via `IDbContextFactory`, com `ContextoSessaoBanco(UsuarioId?, EmpresaId?)` imutável) e o interceptor lê esse valor. Endpoints de dado usam o contexto da sessão validada; os fluxos de identidade (§1.1) criam o contexto de que precisam, explicitamente.

Detalhes para o dev:
- Comando do interceptor: um `SELECT` com duas chamadas a `set_config(nome, @valor, false)`, com `@u`/`@e` como **parâmetros** (texto: guid em minúsculas ou vazio). Os nomes das variáveis são constantes do código, nunca entrada.
- O `set_config(..., false)` roda **antes** de qualquer `BEGIN` do EF (o interceptor dispara na abertura). Dentro de uma transação que desse rollback, o efeito sumiria ([doc SET](https://www.postgresql.org/docs/current/sql-set.html)).
- Variável personalizada definida e depois resetada volta como texto vazio, não `NULL`: por isso a política usa `NULLIF(current_setting(nome, true), vazio)` antes do cast para uuid (herdado do parecer 00011 §2.3).
- Limite honesto: a variável **não é segredo**. Quem tem a credencial de `cronoai_app` e executa SQL livre pode setar a empresa que quiser. O RLS protege contra **filtro esquecido** e erro de código, não contra atacante que já executa SQL livre. Dizer isso no ADR 00006.
- **Se a Infra um dia pôr PgBouncer em modo de transação**, variáveis de sessão vazam entre clientes: trocar para o modo por transação (`set_config(..., true)` com interceptor de transação). Pendência do ADR 00006; hoje (conexão direta, local) não se aplica.

### 1.1 Sequência dos fluxos de identidade (o plano não a explicita; é onde o RLS morde)
| Passo | Contexto do banco | Por quê |
|---|---|---|
| Upsert do usuário no login | nenhum (`usuario` sem RLS) | `ON CONFLICT DO UPDATE` exigiria políticas de SELECT e UPDATE se a tabela tivesse RLS |
| Criar `sessao` | `usuario_id` do upsert | política de `sessao` por `usuario_id` (WITH CHECK) |
| "Minhas empresas" | `usuario_id` | política de `membro_empresa`/`empresa` por membro |
| Gravar `empresa_ativa_id` | `usuario_id` | a FK composta confere o vínculo (a checagem de FK ignora RLS) |
| Validação por requisição | `usuario_id` do cookie (autenticado pelo Data Protection), sem empresa; depois, lida `empresa_ativa_id`, o contexto completo da requisição | o cookie carrega `sid` e `usuario_id`; sem o `usuario_id` no contexto, a leitura de `sessao` devolveria zero linhas |
| Endpoint de dado | `usuario_id` + `empresa_id` da sessão | filtro do EF + RLS |

Cada linha usa um `DbContext` próprio (factory), não o scoped da requisição.

### 1.2 Como provar por teste (além dos do plano)
1. **Controle negativo:** com `NpgsqlConnection` cru, `Maximum Pool Size=1` e `No Reset On Close=true`, setar a variável, devolver e reabrir: o valor **vaza** (prova que o teste detecta vazamento). Com o padrão: volta vazio. Mesmo `pg_backend_pid()` nos dois passos.
2. **Sobrescrita independente do reset:** com `No Reset On Close=true`, contexto A e depois contexto vazio pelo EF na mesma conexão física: 0 linhas. Prova a condição 1.
3. **Concorrência:** `Task.WhenAll` de dezenas de requisições alternando A e B com `Maximum Pool Size` pequeno (2 a 3); nenhuma resposta traz marcador da outra (o plano só testa A,B,A,B em sequência com pool 1).
4. **Caminho de erro:** requisição que lança depois de abrir a conexão; a seguinte, de outra empresa, não herda contexto.
5. **Guarda de configuração:** string com `No Reset On Close=true` impede a partida.
6. **Todas as conexões passam pelo interceptor:** regra (grep ou teste de arquitetura) proibindo `NpgsqlDataSource`/`NpgsqlConnection` em `server/src` fora do interceptor e do design-time.

---

## 2. Ponto 2: FORCE ROW LEVEL SECURITY, migrador e semente

Fatos [prática, https://www.postgresql.org/docs/current/ddl-rowsecurity.html]:
- Com `FORCE`, o **dono também** se sujeita às políticas: o `cronoai_migrador` sem variáveis vê zero linhas (o que o arquiteto notou). Superusuário e `BYPASSRLS` continuam ignorando.
- **DDL não é filtrada por RLS** (`ALTER TABLE`, `CREATE INDEX`, `ADD CONSTRAINT`), e **verificações de integridade referencial e de unicidade sempre ignoram RLS**. Logo, aplicar migração de estrutura e FKs (inclusive a composta da sessão) funciona normalmente com `FORCE`.
- `TRUNCATE` não passa por RLS, mas `cronoai_app` não tem o privilégio (o default do `Inicial` concede só SELECT, INSERT, UPDATE, DELETE).

**Decisão [opinião]: manter `FORCE`.** Vale porque torna o teste "como dono" significativo e impede que alguém aponte a API para a string do migrador por engano e "funcione" sem RLS. Custo e regras que o plano deve registrar:

1. **Migração de dados é o perigo real:** um `UPDATE`/`INSERT`/`DELETE` em tabela com RLS, rodado pelo migrador sem contexto, **afeta zero linhas sem erro**. Regra para o ADR 00006 e `backend-dotnet.md`: toda migração de dados em tabela com RLS usa um helper único (em `CronoAI.Dados/Rls/`) que, **dentro da transação da migração** (o EF envolve cada migração em transação no Npgsql), seta a empresa com `set_config(..., true)` por empresa, ou alterna `NO FORCE`/`FORCE` na mesma transação. Estender a regra R15 para acusar DML em `migrationBuilder.Sql` sobre tabela com RLS fora do helper. Neste ciclo não há migração de dados.
2. **Não** criar política `TO cronoai_migrador USING (true)`: anularia o `FORCE` para o único dono.
3. **Fixture e testes** semeiam como `cronoai_app` com contexto, como o plano já prevê (`DadosTeste.cs`). Acrescentar o teste `Dono_tambem_se_sujeita_ao_rls` (migrador sem contexto: 0 linhas), que documenta o comportamento e evita que alguém "conserte" criando política para o dono.
4. **Semente de desenvolvimento** (`semear-desenvolvimento`, como `cronoai_app`):
   - usar **ids fixos e fictícios** para as 3 empresas (constantes no código) e `INSERT ... ON CONFLICT (id) DO NOTHING`: a idempotência não exige ler a tabela (sob RLS a leitura precisaria de contexto) e `DO NOTHING` só pede a política de INSERT;
   - por empresa, abrir um contexto com `empresa_id` = id dela (a política de INSERT de `empresa` é `id = empresa ativa`) e inserir empresa e membros; os usuários dev entram antes pelo mesmo upsert do login (emissor reservado), porque `membro_empresa` tem FK para `usuario`;
   - nunca o superusuário; recusa fora de `Development` (já no plano).
5. **Backup local (00023):** `pg_dump` desliga RLS por padrão e **falha** se uma política filtrasse; usar o papel de bootstrap (superusuário local) ou `--enable-row-security` com contexto. Papel de backup em produção é da Infra. Registrar como nota.
6. **Papel específico nas políticas:** criar todas com `TO cronoai_app`. Outro papel que um dia exista (relatórios, limpeza) nasce sem acesso por padrão (falha fechada).

---

## 3. `usuario` fora do RLS (pergunta 2)

**Aceito com condições [opinião].** O que se ganha: o upsert do login (`ON CONFLICT DO UPDATE`) e a busca por (emissor, sujeito) antes de existir `usuario_id` ficam simples e sem `SECURITY DEFINER`. O que se perde, e precisa ficar escrito no ADR 00006: `cronoai_app` lê **todos** os usuários de **todas** as empresas (nome de exibição e o par emissor + sujeito, que é dado pessoal pseudonimizado) a qualquer momento, mesmo sem contexto. O RLS não protege essa tabela, só o filtro de código. Condições:
1. Teste de arquitetura: o `DbSet<Usuario>` só é usado em `ConsultasIdentidade.cs` (e na semente); qualquer outro acesso reprova. Listagens futuras de membros (00014) saem de `membro_empresa` (filtrada) e só então juntam o usuário.
2. Colunas mínimas: nenhuma coluna a mais (sem e-mail, sem foto). Já é o plano.
3. `REVOKE DELETE` (§4); pseudonimização, quando o Jurídico definir, é `UPDATE` do nome, nunca `DELETE`.
4. **Reavaliar no 00014**, quando houver listagem de membros: passar `usuario` para RLS com política "o próprio usuário, ou membro da empresa ativa", e o login por (emissor, sujeito) por um par de variáveis de login (alternativa a `SECURITY DEFINER`). Não fazer agora: complexidade sem endpoint que a justifique.
- `__ef_migrations_history`: a lista global do teste de catálogo deve **também** provar que `cronoai_app` não tem privilégio nela (teste `Aplicacao_nao_acessa_historico_de_migracoes`). Pelo `Inicial`, os privilégios padrão só valem para tabelas criadas depois dele e o histórico nasce antes; **conferir** com o teste.

---

## 4. Políticas e privilégios (perguntas 1, 4 e 6)

Sejam `U` = `(SELECT NULLIF(current_setting(GUC_USUARIO, true), vazio)::uuid)` e `E` = idem para `GUC_EMPRESA` (subconsulta escalar: o planner avalia uma vez; o plano em cache não congela o valor, porque a variável é lida na execução).

| Tabela | Privilégios para `cronoai_app` (REVOKE do excedente do default) | Política (todas `TO cronoai_app`, `ENABLE` + `FORCE`) |
|---|---|---|
| `usuario` | SELECT, INSERT, UPDATE; **sem DELETE** | sem RLS (§3) |
| `empresa` | SELECT, INSERT; **sem UPDATE, sem DELETE** (nenhum endpoint do ciclo renomeia ou apaga) | SELECT: `id = E` ou existe `membro_empresa` com `empresa_id = empresa.id` e `usuario_id = U`. INSERT: WITH CHECK `id = E` |
| `membro_empresa` | SELECT, INSERT; **sem UPDATE, sem DELETE** (remoção e troca de perfil são do 00014, que concede o que precisar) | SELECT: `usuario_id = U` ou `empresa_id = E`. INSERT: WITH CHECK `empresa_id = E` |
| `sessao` | SELECT, INSERT, UPDATE, DELETE (DELETE só para a limpeza oportunista do §6) | uma política por comando, todas com `usuario_id = U` (USING e WITH CHECK onde couber) |
| `__ef_migrations_history` | nenhum | sem RLS, inacessível ao papel |

- **Políticas por comando, não `FOR ALL`** [prática]: leitura mais simples de auditar, e comando sem política fica negado. Escrever `WITH CHECK` explícito em INSERT e UPDATE (sem ele, o UPDATE reaproveita o USING, o que raramente é o desejado).
- **Mínimo privilégio é do ciclo, não do futuro:** conceder o que o código do 00012 usa; o 00014 e o 00013 concedem o resto na migração deles. O `REVOKE` na migração `IdentidadeEmpresas` (o default do `Inicial` concede DML geral): `REVOKE DELETE ON usuario`, `REVOKE UPDATE, DELETE ON empresa`, `REVOKE UPDATE, DELETE ON membro_empresa`. Teste de privilégios por tabela (`has_table_privilege`) lendo o catálogo. Opcional, para depois [opinião]: trocar o `ALTER DEFAULT PRIVILEGES` por concessão explícita por tabela, para o esquecimento de `REVOKE` não virar permissão.
- **Pergunta 6:** a subconsulta de `empresa` sobre `membro_empresa` é avaliada **com o RLS de `membro_empresa`** aplicado ao chamador. Com contexto só de usuário, a política de membro mostra as linhas do usuário, e o `EXISTS` acha o vínculo. Sem recursão (membro não cita empresa; o PostgreSQL só recusa dependência circular). Teste: usuário membro de duas empresas, contexto só de usuário, vê as duas; não membro vê zero; contexto só de empresa vê só a ativa.
- **Exposição aceita:** a política de SELECT de `membro_empresa` por `empresa_id = E` deixa qualquer membro ver os vínculos (ids de usuário) dos colegas da empresa ativa. Nenhum endpoint do 00012 os lista; o 00014 decide por perfil (o banco não conhece perfil; é regra de aplicação).
- Nomes de política até 63 bytes (teste do plano já cobre `pg_policies`).

---

## 5. Pontos 3 e 4: índices, FKs compostas e unicidade

**FK composta da sessão** `(empresa_ativa_id, usuario_id) → membro_empresa(empresa_id, usuario_id)`: correta; a ordem coincide com a PK, que serve de índice do lado referenciado. Com `MATCH SIMPLE` e `empresa_ativa_id` nulo, não há conferência, o desejado. A checagem de FK ignora RLS, portanto vale mesmo que as linhas de membro de outras empresas sejam invisíveis ao usuário. Efeito colateral aceito: o código de erro da FK revela se **o próprio** usuário é membro daquela empresa (nada além disso).
- `ON DELETE RESTRICT` (por regra do ADR 00004): o 00014, ao remover um membro, precisa antes encerrar ou anular a empresa ativa das sessões dele. **Armadilha para o 00014:** a política de `sessao` por `usuario_id` impede o administrador de enxergar e atualizar sessões de **outro** usuário. A remoção de membro precisará de política (por exemplo UPDATE de `sessao` com `empresa_ativa_id = E`) ou a FK passará a `ON DELETE SET NULL (empresa_ativa_id)` (PostgreSQL 15+, [doc](https://www.postgresql.org/docs/current/sql-createtable.html), lista de colunas no SET NULL), o que o EF talvez não exprima (conferir). Registrar no ADR 00006 como decisão do 00014; **não** resolver agora.
- Filtro global do EF: `MembroEmpresa` terá o filtro `"Empresa"`; `Empresa` (chave `Id`) e `Sessao` (`EmpresaAtivaId`) não implementam `IDadoDeEmpresa` e ficam sem filtro de EF, só com RLS. Aceitável; os endpoints devem consultar `empresa` por `id = empresa da sessão` explicitamente. O EF pode emitir aviso de "extremo obrigatório com filtro" na relação `Sessao → MembroEmpresa`; a relação é opcional, então o esperado é não haver (conferir).
- **Índices:** PK de `membro_empresa (empresa_id, usuario_id)` atende "membros da empresa" e o EXISTS da política; `(usuario_id)` atende "minhas empresas". `sessao`: PK `id` atende a validação por requisição; `(usuario_id)` atende a política e a limpeza oportunista. Sem índice extra (volume pequeno; medir antes).
- **Convenção do 00011 (FK composta `(empresa_id, X)` → `X(empresa_id, id)`):** neste ciclo só vale para a tabela que tem `empresa_id` e filha de outra empresa-escopada; aqui não há. Vale a partir do 00013 (`obra`).

**Unicidade do vínculo usuário-empresa:** PK `(empresa_id, usuario_id)` basta; não pode haver par duplicado.

**Unicidade de (emissor, sujeito)** [prática OIDC Core §2, `sub` é único por emissor, até 255 caracteres ASCII, sensível a caixa]:
- `UNIQUE (emissor, sujeito)`; **não** normalizar nem alterar caixa. Guardar o `iss` **validado** do token (igual ao do documento de metadados), não a configuração, para diferença de barra final não gerar usuário duplicado.
- CHECK de emissor com tamanho mínimo 1 (o plano só limita o máximo) e sujeito entre 1 e 255 (já no plano).
- A collation do banco (ICU pt-BR, determinística) compara igualdade byte a byte: sem risco de dois valores "iguais" por colação.
- **Upsert:** `INSERT ... ON CONFLICT (emissor, sujeito) DO UPDATE SET ultimo_acesso_em, nome_exibicao ... RETURNING id`. Deve devolver o id **existente** (por isso DO UPDATE, não DO NOTHING) e **nunca** tocar em `desativado_em` (login não reativa conta desativada). O id candidato (v7) é gerado na aplicação e descartado se houver conflito. A execução paralela do mesmo `sub` serializa na linha: correto. Mapear com `SqlQuery<Guid>` interpolado (conferir o nome da coluna de escalar no EF 10).
- `emissor` reservado `urn:cronoai:desenvolvimento`: o banco não distingue ambiente; a recusa é de aplicação (plano §3.4), correta.
- SPEC-01 §5 lista `cnpj` em `empresa`; o plano o omite. Concordo (minimização; um `UNIQUE (cnpj)` global ainda permitiria sondar a existência de empresa de outro cliente). Registrar a emenda da SPEC-01 §5 e deixar a decisão para o ciclo que precisar, com o Jurídico.

---

## 6. Ponto 5: `sessao`, id, expiração, retenção e limpeza

- **id uuid v4: confirmo a exceção** [opinião; coerente com o ADR 00004, que diz que v7 não é controle de segurança]. Gerar com CSPRNG explícito (`RandomNumberGenerator`, 16 bytes), sem depender de `Guid.NewGuid()` para credencial (a documentação não promete aleatoriedade criptográfica; conferir). O tipo `uuid` aceita qualquer 128 bits. Registrar a exceção no ADR 00004.
- **Defesa já existente:** o `sid` viaja dentro do cookie cifrado e autenticado pelo Data Protection. Quem só tem o banco (cópia, backup) não forja cookie sem o anel de chaves; não é preciso guardar hash do `sid` [opinião].
- **CHECKs a acrescentar:** `expira_em > criada_em` e `encerrada_em IS NULL OR encerrada_em >= criada_em`.
- **Tempos:** `criada_em`, `expira_em`, `encerrada_em` em `timestamptz` UTC, calculados pelo `TimeProvider` e passados como parâmetro (não `now()` do banco), para o `RelogioTeste` controlar o tempo. A inatividade (30 min deslizantes) fica **só no ticket do cookie**; o banco guarda o prazo absoluto (8 h) e o encerramento. Não gravar `ultima_atividade_em` por requisição (escrita por requisição sem ganho agora) [opinião]. Consequência a registrar: revogar (`encerrada_em`) vale na próxima requisição, e cookie roubado e usado continua deslizando até o teto de 8 h.
- **Retenção e limpeza (sem jobs até a Fase 3):**
  1. **Limpeza oportunista no login**, só das sessões **do próprio usuário** já terminadas há mais que a retenção: `DELETE ... WHERE usuario_id = contexto AND (expira_em < corte OR encerrada_em < corte)`. Passa pelo RLS (só linhas dele), usa o índice `(usuario_id)`, tem volume limitado e dispensa papel novo. É o único motivo de `cronoai_app` manter DELETE em `sessao`.
  2. **Retenção padrão sugerida: 30 dias após `expira_em`/`encerrada_em`** [opinião], só para o forense de "quem entrou quando". O prazo definitivo é do **Jurídico** (a linha liga `usuario_id` a instantes de acesso; sem IP). Configurável em `Autenticacao:Sessao:RetencaoDias`, com teste do corte via `RelogioTeste`.
  3. **Limpeza em lote** (usuários que nunca voltam): fica para o 00023. Exige visibilidade entre usuários, ou seja, papel ou política próprios (`TO` papel de limpeza com `USING` sobre `expira_em`/`encerrada_em`), **nunca** `BYPASSRLS` na aplicação. O índice `(expira_em)` nasce junto dela.
  4. Volume: milhares de sessões por dia é pequeno; autovacuum padrão basta.
- Teste de integridade: `Sessao_so_aponta_para_empresa_da_qual_o_usuario_e_membro` (plano) mais `Usuario_nao_ve_sessao_de_outro_usuario` (contexto B não lê nem atualiza sessão de A).

---

## 7. Riscos e lacunas restantes

- **Mapeamento de erros:** `UPDATE` de recurso de outra empresa afeta zero linhas sob RLS e o EF lança `DbUpdateConcurrencyException`, que viraria **409** (errado: deveria ser 404). Regra para o ADR 00006, a valer desde o 00013: carregar a entidade pelo caminho filtrado primeiro (404 se ausente) e só então atualizar. Violação de política em INSERT (`42501`) é bug de servidor: 500 genérico em ProblemDetails, com log sem dado pessoal.
- Conexão aberta manualmente pelo EF (`Database.OpenConnection`) ainda passa pelo interceptor; conexão obtida fora do EF não (regra do §1.2, item 6).
- Pendências com outras áreas: retenção de `sessao` e pseudonimização de `usuario` (Jurídico); provedor e tempos de sessão (Segurança); PgBouncer ou outro pooler, backup e papel de limpeza em produção (Infraestrutura). Pacote `Microsoft.AspNetCore.Authentication.OpenIdConnect` e família `Microsoft.IdentityModel.*`: revisão de segurança e de licença antes de produção (já no plano §08).

CONHECIMENTO NOVO:
- Com `FORCE`, DML de migração em tabela com RLS afeta zero linhas **sem erro**: toda migração de dados precisa de helper que seta o contexto dentro da transação. DDL e checagens de FK e unicidade não sofrem RLS.
- Fluxos de identidade (login, validação de sessão) precisam de contexto próprio por etapa; o contexto do banco deve ser imutável por `DbContext` (factory), senão o interceptor lê valor velho.
- Sobrescrever sempre as duas variáveis na abertura da conexão torna o vazamento pelo pool independente do reset do Npgsql; o reset é a segunda rede.
- `UPDATE` cross-tenant sob RLS vira `DbUpdateConcurrencyException` no EF (risco de 409 em vez de 404).
- Remover membro no 00014 esbarra na política de `sessao` por usuário e na FK composta com `RESTRICT`: precisa de política ou de `ON DELETE SET NULL (coluna)`.
- Dado de `usuario` (nome, emissor + sujeito) é legível por `cronoai_app` entre empresas enquanto a tabela ficar fora do RLS: risco residual a reavaliar no 00014.

---

## Ajustes ao plano 00012 (lista para o VEREDITO)

1. **§3.5 e §07, interceptor:** sobrescrever **sempre** as duas variáveis (vazias incluídas); contexto imutável por `DbContext` via `IDbContextFactory` (`ContextoSessaoBanco`), em vez de `ContextoSessao` scoped mutável; guarda de partida contra `No Reset On Close=true`; `NpgsqlDataSource`/`NpgsqlConnection` proibidos em `server/src` fora do interceptor e do design-time.
2. **§11 testes de pool:** acrescentar controle negativo (vaza com reset desligado), sobrescrita independente do reset, concorrência com pool pequeno, caminho de erro e guarda de configuração (§1.2 deste parecer).
3. **Fluxos de identidade:** registrar no plano e no ADR 00006 a sequência do §1.1 (upsert sem contexto; sessão e "minhas empresas" com `usuario_id`; validação com o `usuario_id` do cookie), cada etapa com seu `DbContext`.
4. **§07 políticas e privilégios:** todas `TO cronoai_app`, por comando, com `WITH CHECK` explícito; tirar políticas e privilégios de UPDATE/DELETE de `empresa` e de UPDATE/DELETE de `membro_empresa` (nenhum endpoint os usa); `REVOKE DELETE` em `usuario`; manter DELETE só em `sessao`; teste de privilégios por tabela e `Aplicacao_nao_acessa_historico_de_migracoes`.
5. **FORCE:** manter; registrar a regra de migração de dados (helper com contexto dentro da transação), estender R15 para DML de migração sobre tabela com RLS e acrescentar o teste `Dono_tambem_se_sujeita_ao_rls`. Proibir política para o migrador.
6. **Semente:** ids fixos fictícios por empresa, `ON CONFLICT (id) DO NOTHING`, um contexto por empresa, usuários dev criados pelo upsert do login antes dos vínculos; nunca superusuário.
7. **`usuario` fora do RLS:** aceito; acrescentar o teste de arquitetura que limita o uso de `DbSet<Usuario>` a `ConsultasIdentidade.cs` (e semente), registrar o risco residual no ADR 00006 e a reavaliação no 00014.
8. **`sessao`:** id por CSPRNG; CHECKs de datas; limpeza oportunista por usuário no login com retenção configurável (padrão sugerido 30 dias; prazo final do Jurídico); inatividade só no ticket; limpeza em lote e índice `(expira_em)` no 00023.
9. **`usuario`:** CHECK de tamanho mínimo do emissor; guardar o `iss` validado; upsert com `RETURNING id`, sem tocar `desativado_em`. Registrar a emenda da SPEC-01 §5 (sem `cnpj` por ora).
10. **ADR 00006:** incluir o mapeamento 404/409/500 (carregar antes de atualizar), a nota do PgBouncer em modo de transação, a armadilha da remoção de membro no 00014 e o limite de que a variável de sessão não é segredo. **ADR 00004:** registrar a exceção do uuid v4 em `sessao`.

VEREDITO: AJUSTAR
