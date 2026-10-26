---
issue: —
spec: SPEC-02 (RF-02.2, RF-02.3, RF-02.3a só modelo e vínculo), SPEC-01 (RF-01.1c, modelo no banco), SPEC-14 (RF-14.8, modelo no banco; API no 00014b), SPEC-12 (RF-12.9), RNF-02.3, ASVS 5.0.0 V2, V4, V7, V8, V14, V16, PLANO-FASE-2 §5.4, §8.2 e §8.3
branch: feat/00014-perfis-permissoes
base: feat/00013-obras-auditoria (1c7cea7) (PR empilhado enquanto o 00013 não entrar na master)
faixa: 3 (T5, T8)
ficha_ou_plano: .claude/ciclos/00014-perfis-permissoes-plano.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00014 — Perfis, matriz perfil × ação, permissão por obra e gestão de membros

## Resumo
- **O que é:** cada membro da empresa passa a ter um perfil (os 7 da SPEC-02 §3) e um escopo de obras. O banco decide **quais obras** cada um enxerga (RLS por obra); o código decide **o que** cada perfil faz (matriz perfil × ação em tabela de código, aplicada por políticas do ASP.NET Core). Contém:
  - `membro_empresa` com `perfil`, `escopo_obras`, `removido_em` e `atualizado_em`; tabelas `acesso_obra`, `frente`, `acesso_frente`, `carteira`, `carteira_obra` e `acesso_carteira` (frentes e carteiras só com o modelo; API no 00014b);
  - migração nova `20261025233436_PerfisPermissoes`, sem tocar a `ObrasAuditoria`;
  - **escalada de privilégio fechada:** o papel da aplicação perdeu o INSERT em `membro_empresa` e a política de INSERT foi removida;
  - gatilho `trg_membro_exige_administrador` (no lugar de uma política recursiva, que daria 42P17) e gatilho diferido do último administrador, com advisory lock de duas chaves;
  - trilha lida pela visibilidade da obra; trilha sem obra só para o administrador;
  - matriz aplicada às 8 rotas existentes mais `/eu`; obra sem vínculo → 404 idêntico ao de inexistente; ação fora da matriz → 403;
  - 7 rotas novas: membros (listar, trocar perfil, remover, reativar) e acessos de obra (listar, conceder, revogar);
  - `ProvisionamentoEmpresa` (semente de desenvolvimento com a credencial do migrador, só em `Development`);
  - R18 e R19 ampliadas; ADR 00010 (`Proposto`).
- **Decidido:**
  - divisão em três ciclos (opção C): este 00014; o 00014b com a API de frentes e carteiras; o 00014c com o convite e o `usuario` sob RLS, que só começa depois do parecer da Segurança sobre a Q6 (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - gate Q1 a Q11 pelas recomendações do parecer do `dba` (`00014-tarefa0-dba.md`); a Q3, sem recomendação no parecer, pela SPEC-02 §3: o gestor de portfólio atribui obras e frentes no próprio alcance (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - obra sem vínculo responde 404, e não o 403 da SPEC-02; a divergência vai ao usuário (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - gatilho `BEFORE UPDATE` em `membro_empresa` em vez da política recursiva do parecer, e `carteira_obra` sem citar `obra` (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - `especialista-obra` dispensado: não há cálculo nem número de obra (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - emenda 01 do plano: os pontos do parecer do `dba`, com o ajuste técnico de recursão (plano §16) (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - rodada 02: a remoção lógica do membro revoga `acesso_obra` e `acesso_frente`, com trilha `remover`; a reativação não restaura nada (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - rodada 02: o gestor lê vínculos só no próprio alcance (`AlcanceGestor`) e a trilha sem obra só é gravada por administrador (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - rodada 02: a `PerfisPermissoes` foi editada no lugar, porque ainda não tinha push (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - rodada 02: o Up da `PerfisPermissoes` passa a gerar alerta R19, e os 8 alertas (4 no Up, 4 no Down) ficam como esperados e conferidos (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - rodada 02: o comando de produção da Q8 TEM de recusar empresa existente e não herda o `NO FORCE` sem a Infraestrutura (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - rodada 03: o helper de RLS recusa nome de tabela fora de `^[a-z_][a-z0-9_]*$` (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - rodada 03: a corrida remover × conceder e a revogação de `acesso_carteira` ficam como pendência do 00014b, registradas no ADR 00010 (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - itens só registrados, sem mudança: `seguranca` r01 5 a 8; `dba` r01 4, 7, 9 e 10; `dba` r02 O1 a O3; `seguranca` r02 Info (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR);
  - o ADR 00010 fica "Proposto" até o aceite do usuário.
- **O que você precisa fazer:**
  - revisar no PR o gate Q1 a Q11, a Q3, a divergência **404 × 403** da SPEC-02, as células de opinião da matriz (plano §3.5), a divisão em 00014/00014b/00014c e as decisões das rodadas (V-1);
  - fazer merge da `master` antes do PR; o PR é empilhado em `feat/00013-obras-auditoria` se o 00013 não tiver entrado (o 00013 ainda depende da sua conferência das UFs, V-1 dele);
  - conferir os jobs do backend e o CodeQL C# verdes no PR;
  - levar à **Segurança da Informação**, ao **Jurídico**, ao **RH** e à **Infraestrutura** os itens da última seção.
- **Estado:** **validadores aprovados; auditoria independente r01 (42f82cf) REPROVADO por 2 achados Baixo, corrigidos em 675ef32; reauditoria: A PREENCHER.** Falta o CI do PR.
  - `testes`: APROVADO na r01 (796ef21, 597/597 2x, V-2 completa) e na r02 (d6bf1dd, 606/606 2x, mutações reais na migração detectadas). Não foi acionado na r03.
  - `arquiteto`: REPROVADO na r01 (R-1 a R-4) → AJUSTAR na r02 (5 itens) → APROVADO na r03 (d8b9637).
  - `dba`: AJUSTAR na r01 (10 itens, sem bloqueante) → APROVADO na r02 (O1 a O3). Não foi acionado na r03.
  - `seguranca`: APROVADO na r01 (1 Baixo, 7 Info) → APROVADO na r02 (2 Baixo, 2 Info). Não foi acionada na r03.
  - Suíte .NET: em d8b9637 só o `dev-backend` rodou (613/613); a auditoria r01 reexecutou no HEAD 42f82cf (613/613, 12m12s); em 675ef32, 618/618 (`dev-backend`).

## Pedido
Ciclo 00014 do PLANO-FASE-2 (§5.4): perfis e permissão por obra e por frente, carteiras, SPEC-02 RF-02.3/02.3a, SPEC-01 RF-01.1c e SPEC-14 RF-14.8 (pedido do orquestrador ao `dba` na tarefa 0 e ao `arquiteto` no plano, 25/10/2026). O recorte final é o da divisão C (plano §9).

## Triagem
- **T5 SIM:** dado pessoal (nome de exibição na listagem de membros; `responsavel_texto` da frente, que pode receber nome de trabalhador); trilha append-only de membros e vínculos; corpo JSON das rotas novas.
- **T8 SIM:** 6 tabelas novas e 1 alterada; cerca de 30 políticas; 4 gatilhos; privilégios por coluna; autorização por perfil; 7 rotas novas e 9 alteradas (8 de obra e trilha + `/eu`).
- **T1, T2, T3, T4, T6, T7 NÃO:** sem cálculo, sem SINAPI, nenhum formato de arquivo novo (o CSV da trilha só muda de autorização), front intacto, sem compose, CI ou Dockerfile.
- **Faixa 3.** O `classificar-diff` confirma: faixa 3, `seguranca` obrigatória (T5/T8), `especialista-obra` não exigido (`testes` r01; `dev-backend` r01: T8 backend, 133 arquivos). O `especialista-obra` foi dispensado no gate (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR).

## Commits
| SHA | Conteúdo |
|---|---|
| 53c86df | Plano do ciclo, parecer do `dba` (tarefa 0) e gate |
| 955e53f | E1: perfis, escopo de obras e RLS por obra no banco (inclui a semente de desenvolvimento, antecipada: desvio 1) |
| 355ac21 | E2: matriz perfil × ação nas rotas e 404 para obra sem vínculo |
| e63f9c9 | E3: gestão de membros e acessos de obra com trilha |
| 796ef21 | E4: ADR 00010, regras R18 e R19 ampliadas, documentação |
| 6919a73 | Rodada 02, docs e regras: R19 com helper e CHECK da trilha em várias linhas; ADRs 00004, 00009 e 00010 alinhados |
| d6bf1dd | Rodada 02, código e testes: vínculos pelo alcance do gestor, trilha sem obra só do administrador, remoção revoga acessos, responsável conferido só se muda, lock de duas chaves, `lock_timeout`, isolamento com recursos reais |
| d8b9637 | Rodada 03: R19 com argumento nomeado, qualquer caixa, `DROP CONSTRAINT` e `ExecutarDmlComRls`; helper recusa nome fora de minúsculas; `MERGE INTO` na R15; ADR 00010 com `acesso_carteira`, corrida e oráculo |
| 42f82cf | Registro do ciclo (rodadas 01 a 03, matriz e ressalvas) |
| 675ef32 | Correção da auditoria r01: 413 nas 5 escritas novas (`EscritasNovasTestes`) e frase do helper de RLS qualificada em `backend-dotnet.md` e no ADR 00009 |

**Nota sobre os commits da rodada 02.** O `dev-backend` criou os dois commits com o trailer `Co-Authored-By: Claude Sonnet 5.5`, seguindo um lembrete do sistema, e não com o `Claude Opus 5.5` pedido. Antes de qualquer push, o orquestrador reescreveu só o trailer: 3a26ba9 → 6919a73 e c2e0741 → d6bf1dd. A árvore ficou idêntica: `HEAD^{tree}` igual nos pares (3a26ba9 e 6919a73: 6d5ffc8; c2e0741 e d6bf1dd: c4ce69c, conferido com `git rev-parse` na redação deste registro). Os validadores da r02 revisaram d6bf1dd. O commit da r03 já saiu com o trailer do Opus.

## Rodadas
| Rodada | testes | arquiteto | dba | seguranca |
|---|---|---|---|---|
| 01 (796ef21) | APROVADO: 597/597 2x; V-2 completa; 2 defeitos de teste e 1 ressalva da R19 (não bloqueiam) | REPROVADO: R-1 (Média, R19 cega ao Up), R-2 (Média, obra restaurada com responsável removido), R-3 (Baixa, dois tipos públicos por arquivo), R-4 (Baixa, docs); avaliação dos 16 desvios | AJUSTAR: 10 itens (2 MÉDIA, 6 BAIXA, 1 INFO e 1 observação), sem bloqueante | APROVADO: 1 Baixo e 7 Info |
| 02 (d6bf1dd) | APROVADO: 606/606 2x; mutações reais na migração detectadas; 3 defeitos de teste (não bloqueiam) | AJUSTAR: 5 itens (4 brechas da R19 e 1 de documentação); R-1 a R-4 fechados | APROVADO: O1 a O3, sem bloqueante | APROVADO: 2 Baixo e 2 Info |
| 03 (d8b9637) | — (não acionado) | APROVADO: sonda H2, H3, H4, H5, S6, H9 e M2 acusam; flag `i` sem falso positivo nos 163 `.cs`; nenhum nome de tabela fora do padrão; docs coerentes; 1 observação (`GerarSql`) | — (não acionado) | — (não acionada) |
| auditoria r01 (42f82cf) | — | — | — | REPROVADO: 2 Baixos (AUD-1 S-6; AUD-2 documentação); gates no HEAD verdes (613/613); 37 de 48 evidências conferidas |
| reauditoria (A PREENCHER) | — | — | — | A PREENCHER |

Auditoria independente: r01 (42f82cf) REPROVADO, 2 Baixos (AUD-1: 413 provado só em 1 das 5 escritas novas; AUD-2: `backend-dotnet.md:39` afirmava validação de nome no helper de DML) → 675ef32. Reauditoria: A PREENCHER.

### Testes do backend, antes → depois
| Ponto | Total | Fonte |
|---|---|---|
| Fim do 00013 (1c7cea7) | 451 | registro do 00013; `dev-backend` r01 ("451 antes") |
| E1 a E4 (796ef21) | 597 (+146) | `dev-backend` r01 (12m33s); `testes` r01: 597/597 2x (15m08s e 14m24s). Contagens intermediárias por entregável não foram informadas |
| Rodada 02 (d6bf1dd) | 606 (+9) | `dev-backend` r02: 606 com 2 vermelhos corrigidos e só as 2 classes rerodadas (5/5); `testes` r02: 606/606 2x (10m25s e 10m50s) |
| Rodada 03 (d8b9637) | 613 (+7) | só o `dev-backend` r03: 613/613, 9m22s, exit 0. Nenhum validador reexecutou a suíte .NET neste SHA; a auditoria r01 reexecutou no HEAD 42f82cf: "total 613, falhou 0, ignorados 0", 12m12s |
| Correção da auditoria (675ef32) | 618 (+5) | `dev-backend`: 618/618, exit 0; Theory de 5 casos em `EscritasNovasTestes` |

Regras do `validar-regras` (`node --test`): 111 no fim do 00013; 140 em 796ef21 (`dev-backend`, `testes` r01 e `arquiteto` r01); 146 em d6bf1dd (`dev-backend`, `testes` r02, `dba` r02 e `arquiteto` r02); 160 em d8b9637 (`dev-backend` r03 e `arquiteto` r03).
`validar-regras --base feat/00013-obras-auditoria --commits`: `149 arquivo(s) | 0 bloqueia, 2 alerta` em 796ef21 (`dev-backend` e `testes` r01); `153 arquivo(s) | 0 bloqueia, 8 alerta` em d6bf1dd (`testes` r02); 0 bloqueia e 8 alertas, os mesmos, em d8b9637 (`dev-backend` r03 e `arquiteto` r03).

### Desvios do plano e avaliação do `arquiteto`
| # | Desvio declarado pelo `dev-backend` | Avaliação do `arquiteto` (r01) e destino |
|---|---|---|
| 1 | Semente (tarefa 15) antecipada para o E1, porque o app perdeu o INSERT em `membro_empresa`; `ProvisionamentoEmpresa` faz `NO FORCE` em `empresa` **e** em `membro_empresa` (o plano §3.8 citava só `membro_empresa`) | Aceitável com registro. Só a semente de `Development` usa; o `NO FORCE` só afeta o dono. Custo operacional se a Q8 reutilizar (ACCESS EXCLUSIVE nas tabelas lidas a cada requisição): reavaliar com a Infraestrutura e a Segurança. Docs corrigidas em 6919a73 (R-4); `lock_timeout` em d6bf1dd |
| 2 | T31 como escrito é impossível: o lote do EF envia o DELETE antes do INSERT da trilha. Trocado por `Atomicidade_trilha_antes_do_update_que_falha` (UPDATE com CHECK violado depois da trilha) e por um teste que fixa a ordem do DELETE | Aceitável com registro (ADR 00009 §6 e ADR 00010 §6). `testes` r01: "o T31' cumpre a lição 6, junto com o T30" |
| 3 | 42501 da trilha para obra fora de vista não traz `TableName` no Npgsql; o mapeamento usa só o SqlState e o serviço reconfere a visibilidade (invisível → 404; visível → 500 genérico) | Aceitável com registro. O 500 só aparece em corrida em que o chamador perde perfil, escopo ou vínculo no meio da escrita (`CriarAsync` de obra, gatilho em `ServicoMembros`, `ConcederAsync`). Teste de integração acrescentado em d6bf1dd (`AcessosObraApiTestes.cs:180`). Mapear para 403: opcional, registrado |
| 4 | Falha do gatilho diferido chega como `PostgresException` direta; `catch (Exception) when` com filtro por SqlState e ConstraintName | Aceitável com registro: filtro estreito (`ServicoMembros.cs:248` em 796ef21; `:257` desde d6bf1dd) |
| 5 | Testes existentes alterados (`DaEmpresa` → `ComoAdministrador`; `Insert_de_vinculo...` removido em favor do T24; Down da `ObrasAuditoria` em banco isolado; corrida de antiforgery no `NomeObraTestes`) | Aceitável com registro. Ressalva: `DadosTeste.ComoAdministrador` caía em contexto sem usuário. Corrigido em d6bf1dd (`DadosTeste.cs:114` lança) |
| 6 | `DadosTeste.CriarEmpresaAsync` cria um administrador técnico por padrão | Aceitável com registro |
| 7 | Golden dos predicados em arquivo (`Dados/predicados-esperados.txt`), copiado da saída real | Aceitável (o plano já previa) |
| 8 | R19 também alerta a criação por helper; o `dev-backend` disse que "a migração real do 00013 agora alerta 2 vezes" e que os 2 alertas estão nas linhas 595-596 | Aceitável com registro. O `dba` r01 apontou que as linhas 595-596 são do Down da própria 00014, e não da 00013. O alerta do Up faltava: R-1 |
| 9 | Limitação da R19: as chamadas do Up têm `"auditoria"` na linha seguinte e não alertam | **Exige correção (R-1).** Corrigido em 6919a73: o Up passa a alertar (8 alertas) |
| 10 | Linha de corte aplicada por tarefas (sem linha de base de tempo) | Aceitável |
| 11 | Testes extras (contrato do OpenAPI, entidades auditáveis, nome único de frente e carteira) | Aceitável |
| 12 | `SemVinculoDoCenario.Escopo` acrescentado | Aceitável |
| 13 | `Location` de `POST .../acessos` aponta para a coleção; 403 de `incluirRemovidos` dentro do handler | Aceitável com registro. Em d6bf1dd o 403 passou a usar `IAuthorizationService.AuthorizeAsync` com a política `membros.gerir` (`MembrosEndpoints.cs:39`), registrado no `backend-dotnet.md` e no ADR 00010 |
| 14 | `.ProducesProblem` explícito para 404 e 409 | Aceitável (precedente do 00013) |
| 15 | `AddColumn xmin` retirado da migração gerada; `HasName("pk_membro_empresa")` fixado; Down remove antes as políticas das tabelas novas | Aceitável com registro |
| 16 | `psql -c` filtrado nos helpers de teste | Aceitável |
| — | Semente cria a obra direto com `SalvarAuditadoAsync`, e não pelo `ServicoObras` (plano §3.8); não declarado | Observação do `arquiteto` r01: inofensivo. Registro |
| r02-a | Trailer `Claude Sonnet 5.5` nos 2 commits da r02 | Reescrito pelo orquestrador só no trailer, árvore idêntica (nota em "Commits") |
| r02-b | T36: negativo opcional retirado (o correlacionado também mostra `hashed SubPlan` aninhado) | `dba` r02: "Retirar o negativo foi correto". O1 registrado |
| r02-c | `Auditoria_de_empresa_inexistente…`: o app agora recebe 42501 antes da FK; a FK é provada pelo superusuário (23503) | `testes` r02: não ficou mais fraco, mas deixa de provar a FK pelo caminho do app, o que agora é impossível por desenho. Registro |
| r02-d | `PerfisPermissoes` editada no lugar (sem push) | `arquiteto` r02: permitido porque ainda não tem push; diff da `ObrasAuditoria` vazio. Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |

### Matriz de verificação (HEAD d8b9637; cada linha com a evidência da rodada indicada; a suíte .NET em d8b9637 só foi rodada pelo `dev-backend`)

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| G-restore | Lock files | `dotnet restore --locked-mode` | sim | PASS | `testes` r02 (d6bf1dd): "4 projetos restaurados"; `dev-backend` r03 (d8b9637): "ok"; auditoria r01 no HEAD 42f82cf: exit 0, 4 projetos |
| G-build | Build Release sem avisos | `dotnet build CronoAI.slnx -c Release --no-incremental` | sim | PASS | `testes` r02 (d6bf1dd): "0 Aviso(s) 0 Erro(s)", 35,9s; `dev-backend` r03 (d8b9637): "0 avisos e 0 erros"; auditoria r01 no HEAD 42f82cf: "0 Aviso(s) 0 Erro(s)" (1m02s); 675ef32 (`dev-backend`): 0/0 |
| G-format | Format limpo | `dotnet format --verify-no-changes` | sim | PASS | `testes` r02 (d6bf1dd): exit 0; `dev-backend` r03 (d8b9637): "sem saída"; auditoria r01 no HEAD 42f82cf: exit 0; 675ef32 (`dev-backend`): limpo |
| G-test | Suíte completa | `dotnet test --solution CronoAI.slnx -c Release --no-build` | sim | PASS | `testes` r01 (796ef21): 597/597 2x; `testes` r02 (d6bf1dd): "total 606, falhou 0, ignorados 0", 2 execuções (10m25s e 10m50s), sem intermitência; `dev-backend` r03 (d8b9637): "613 totais, 613 com êxito, 0 falhas, 9 min 22 s, exit 0". auditoria r01 no HEAD 42f82cf: "total: 613, falhou: 0, concluído com êxito: 613, ignorados: 0", 12m12s, exit 0; 675ef32 (`dev-backend`): 618/618, exit 0 |
| G-openapi | Contrato bate com o build | `git diff --exit-code -- server/openapi/` | sim | PASS | `testes` r02 (d6bf1dd): árvore limpa depois do build; `dev-backend` r03 (d8b9637): exit 0; auditoria r01 no HEAD 42f82cf: exit 0 depois do build |
| G-pending | Sem migração pendente | `dotnet ef migrations has-pending-model-changes` (`Username=ef_design`) | sim | PASS | `testes` r02 (d6bf1dd) e `dev-backend` r03 (d8b9637): "No changes have been made to the model since the last migration."; auditoria r01 no HEAD 42f82cf: "No changes have been made to the model since the last migration." |
| G-vuln | Sem pacote vulnerável | `dotnet list … --vulnerable --include-transitive` | sim | PASS | `testes` r02 (d6bf1dd): "4 projetos sem pacote vulnerável"; `dev-backend` r03 (d8b9637): "nenhum nos 4 projetos"; auditoria r01 no HEAD 42f82cf: nenhum pacote vulnerável nos 4 projetos |
| G-node | Regras | `node --test .claude/scripts/lib/regras-cronoai.test.mjs` | sim | PASS | `testes` r02 (d6bf1dd): "tests 146, pass 146, fail 0, skipped 0"; `dev-backend` r03 (d8b9637): 160 de 160; `arquiteto` r03 (d8b9637): 160 de 160; auditoria r01 no HEAD 42f82cf: tests 160, pass 160, fail 0 |
| G-regras | validar-regras | `validar-regras.mjs --base feat/00013-obras-auditoria --commits` | sim | PASS | `testes` r02 (d6bf1dd): "153 arquivo(s) \| 0 bloqueia, 8 alerta", R19 em `PerfisPermissoes.cs` 533/540/544/550 (Up) e 601/602/684/709 (Down); `dev-backend` r03 e `arquiteto` r03 (d8b9637): 0 bloqueia, 8 alertas, os mesmos. Alertas esperados e conferidos (ADR 00009 §6, ADR 00010, `backend-dotnet.md`); auditoria r01 no HEAD 42f82cf: "154 arquivo(s) \| 0 bloqueia, 8 alerta" (os 8 R19 esperados); 675ef32 (`dev-backend`): 0 bloqueia, 8 alertas |
| G-classif | classificar-diff | `classificar-diff.mjs --base feat/00013-obras-auditoria --faixa 3` | sim | PASS | `testes` r01 (796ef21): "faixa exigida 3, exit 0; segurança obrigatória (T5/T8); especialista-obra não exigido". Não reexecutado em d6bf1dd nem em d8b9637; auditoria r01 no HEAD 42f82cf: faixa exigida 3, `seguranca` obrigatória, `especialista-obra` não exigido, exit 0 |
| G-lint | ESLint (inclui `.claude/scripts`) | `npm run lint` | sim | PASS | `testes` r02 (d6bf1dd): exit 0; `dev-backend` r03 (d8b9637): exit 0; 675ef32 (`dev-backend`): exit 0; `npm run ci` da auditoria r01 no HEAD 42f82cf: exit 0 |
| AC-1 | Gates | linhas G-* acima | sim | PASS | G-restore a G-lint; em d8b9637 a suíte .NET só pelo `dev-backend` |
| AC-2 | Migração nova, Down/Up, `ObrasAuditoria` sem diff | T34 `Migracao_PerfisPermissoes_up_down_up`, X1 `Migracoes_aplicam_e_reaplicam`, checkpoint 1, `git diff` | sim | PASS | `testes` r01: verdes nas 2 execuções; `git diff --stat 1c7cea7...HEAD` da `20261025201449_ObrasAuditoria*` vazio; V-2 aplicou `ObrasAuditoria` e depois `PerfisPermissoes`. `arquiteto` r02 (d6bf1dd): `git diff feat/00013-obras-auditoria..HEAD -- '*ObrasAuditoria*'` vazio. `arquiteto` r03: o SQL gerado pela `ObrasAuditoria` não muda com `ValidarNomeDeTabela`. Checkpoint 1 (T12 primeiro, backfill + `SET NOT NULL` na mesma transação): declarado pelo `dev-backend` r01 |
| AC-3 | Perfis, escopos, CHECK, backfill Q10 | T01 `Membro_par_perfil_escopo`, T21 `Membro_checks_e_enum`, `Constante_a_mais_no_codigo_reprova...`, T34 | sim | PASS | `testes` r01: verdes. 21 pares no T01 e "sem o backfill o `SET NOT NULL` falha (23502)": declarado pelo `dev-backend` r01 |
| AC-4 | RLS por obra, predicados exatos, sem 42P17 | T11 `Comparador_de_predicados_detecta_afrouxamento`, T12 `Sem_recursao_em_nenhuma_tabela_nem_contexto` (+ controle 42P17), T13 `Obra_visivel_por_escopo`, T14 `Obra_update_sem_where_respeita_alcance` (+`_mutacao`), T15 `Obra_insert_so_escopo_todas` (+`_mutacao`), X2, X3, X6, X9 `Predicados_das_politicas_sao_os_do_plano` | sim | PASS | `testes` r01: golden de 31 linhas, sem INSERT em `membro_empresa`, `auditoria` só SELECT e INSERT; T11 aponta só `pol_obra_select` e `pol_auditoria_insert` afrouxados; T14: B afeta exatamente 1, `SET empresa_id` dá 42501, A afeta 3, mutação afeta ≥4 ("limite frouxo"). `dba` r01: sem recursão 42P17. `testes` r02: golden com diff só em `acesso_frente\|SELECT`, `acesso_obra\|SELECT` e `auditoria\|INSERT`, teste independente de ordem; mutação real B (visibilidade de `obra` volta a `empresa_id = {e}`): 3 de 12 falharam |
| AC-5 | Escalada fechada, membro só por administrador, último administrador | T22 `Membro_update_so_administrador` (+`_mutacao`), T23 `Ultimo_administrador`, `Dois_administradores_se_rebaixando_em_paralelo...`, `Promocao_e_rebaixamento_cruzados_em_paralelo_passam`, T24 `Membro_insert_recusado_para_aplicacao`, T26 `Privilegios_por_tabela_e_coluna`, X4 | sim | PASS | `testes` r01: T24 com 3 INSERTs → 42501, `has_table_privilege INSERT = f`, 0 políticas de INSERT, controle (boot) insere; T22: B, C e G → 42501, `usuario_id`/`empresa_id` → 42501 até para o admin; T23: `ck_empresa_tem_administrador` no COMMIT, concorrência por `Barrier` 1 sucesso e 1 falha, `tgenabled = 'A\|A'`. `seguranca` r01: escalada fechada em duas camadas. `testes` r02 M3: sem o lock, os dois rebaixamentos passam e restam 0 administradores; `finally` restaura e confere. `dba` r02: lock `pg_advisory_xact_lock(14001, hashtext(...))` (`PerfisPermissoes.cs:443`) sem deadlock; nota de READ COMMITTED (`:431-435`) |
| AC-6 | Vínculos, frentes, carteiras no banco | T03, T04, T07 (`EntidadesDePermissaoTestes`), T16 a T19 (+`_mutacao`), T20 `Fks_compostas_por_empresa`, T32, T38 | sim | PASS | `testes` r01: verdes. `testes` r02: `AcessoObra_leitura_e_escrita` e `AcessoFrente_leitura_e_escrita` mais fortes (gestor C de carteiras lê 0); M1 `AcessoObra_leitura_do_gestor_so_no_alcance_mutacao`: 0 → ≥3 com `USING (true)` |
| AC-7 | Remoção lógica nega acesso | T02, T25 `Remocao_logica_no_banco`, T58 `Remocao_logica_nos_fluxos_de_identidade`, `Remover_membro_revoga_os_vinculos_e_reativar_nao_os_restaura` (`MembrosApiTestes.cs:219`) | sim | PASS | `testes` r01: verdes. `seguranca` r02: reativar só zera `removido_em`; o teste confirma 2 + 1 linhas de trilha `remover`. `testes` r02: suíte 606 verde 2x (leitura das asserções de `ServicoMembros` "só pela existência dos testes") |
| AC-8 | Trilha por visibilidade, `usuario_id = U`, `remover`, atomicidade | T27 `Auditoria_por_visibilidade` (+`_mutacao`), T28, T29, T30, T31', T41, X7, X10, `Auditoria_sem_obra_so_do_administrador_mutacao` | sim | PASS | `testes` r01: T30 com `SondaDeComandos` (INSERT da trilha no lote antes do COMMIT que falha; 0 trilha); avaliação do T31' (desvio 2). `testes` r02: `Auditoria_por_visibilidade` com B, C, G e D → 42501 ao gravar trilha sem obra; M2: 42501 → 1 linha com `WITH CHECK (true)`; mutação real A (sem `AlcanceGestor`, sem lock, sem exigência de admin): 9 de 44 falharam. `dba` r02: `pol_auditoria_insert` (`:542-544`) equivalente à leitura |
| AC-9 | Matriz perfil × ação | T05, T06 `Matriz_igual_a_tabela_do_plano`, T42 `Toda_rota_de_dado_declara_acao_da_matriz`, T50 `Matriz_perfil_x_rota` | sim | PASS | `testes` r01: T50 (7 perfis × 15 rotas) contra tabela literal própria, conferida célula a célula com o §3.5, sem divergência; 403 com `type = acao-nao-permitida`, sem escrita nem trilha; T42 exige 15 rotas com 1 ação cada. `seguranca` r01 e `arquiteto` r01: três chamadas a `MatrizPermissoes.Permite`, nenhuma regra de perfil à mão |
| AC-10 | 404 × 403 | T50, T51 `Obra_sem_vinculo_404_identico_ao_inexistente`, T52 `Listagem_de_obras_por_escopo` | sim | PASS | `testes` r01: T51 com GET, PUT e trilha → 404 com corpo igual ao de id inexistente (exceto `traceId`); V-2: `dev-b` recebeu 404 nas obras alheias com corpos idênticos. Divergência com a SPEC-02: V-1 |
| AC-11 | Cadastro, criar, arquivar, exportar; responsável ativo | T53 a T56, T60, `Obra_restaurada_com_responsavel_removido_continua_editavel` (`PermissaoObrasTestes.cs:255`) | sim | PASS | `testes` r01: verdes. R-2 fechado: `arquiteto` r02 confirmou `ServicoObras.cs:140-150` (responsável conferido só quando muda) e o teste; suíte 606 verde 2x (`testes` r02) |
| AC-12 | Sessão com perfil; `/eu`; empresa ativa só com vínculo ativo | T57 `Sessao_traz_perfil_em_uma_consulta`, T58, T59 `Eu_traz_perfil_e_escopo` | sim | PASS | `testes` r01: verdes; V-2: `/eu` devolveu `administrador/todas` (dev-a) e `engenheiro_obra/vinculadas` (dev-b) |
| AC-13 | Gestão de membros | T33 `Membro_versao_xmin`, T61 `Listar_membros`, T62 `Alterar_perfil`, T63 `Remover_e_reativar` | sim | PASS | `testes` r01: T62 afirma 409 `conflito-de-versao` com `estadoAtual`, 400 de par inválido, `perfil-indisponivel`, 413, 409 `ultimo-administrador` sem o nome da constraint e com 0 trilha; V-2: 409 `ultimo-administrador` real. `arquiteto` r02: `incluirRemovidos` pela política (`MembrosEndpoints.cs:39`), 403 do gestor testado em `MembrosApiTestes.cs:70-77` |
| AC-14 | Acessos de obra | T64 `Membro_de_outra_empresa_404_identico`, T65 a T68 (`AcessosObraApiTestes`) | sim | PASS | `testes` r01: verdes; V-2: conceder 201, revogar 204. `seguranca` r02: `Recusa_de_politica_com_obra_ainda_visivel_vira_500_generico_sem_detalhe` (`AcessosObraApiTestes.cs:180`) roda em `Production` e confere a ausência de `acesso_obra`, `cronoai`, `policy`, `row-level`, `42501`, `Npgsql` e `Postgres` |
| AC-15 | Isolamento | T71, T76 `Obra_sem_vinculo_da_mesma_empresa_em_toda_rota_de_obra`, T77 `Concretizacao_usa_recursos_reais`, X5, `Rotas_de_acesso_com_recursos_reais_discriminam_visibilidade_mutacao` (`ObraSemVinculoTestes.cs:157`) | sim | PASS | `testes` r01: PASS com ressalva (revogar sem vínculo real). `testes` r02: D1 e D2 PASS (revogar com `acesso_obra` real; conceder com membro real de A via `CorpoDosRecursos`); M4: 404 sem visão, 204/201 com visão, estado do banco conferido nos dois lados |
| AC-16 | Trilha por rota; logs sem nome nem motivo | T69 `Toda_rota_de_escrita_nova_gera_uma_trilha`, T70 `Logs_sem_nome_nem_motivo` | sim | PASS | `testes` r01: verdes. `seguranca` r01: logs só com ids (`LogsMembros`) |
| AC-17 | Provisionamento e semente | T35 `Provisionamento_restaura_force_e_exige_administrador`, X8 `SementeDesenvolvimentoTestes`, `Provisionamento_desiste_por_lock_timeout_e_nao_deixa_nada_pela_metade` (`ProvisionamentoTestes.cs:85`) | sim | PASS | `testes` r01: verdes; V-2: `semear-desenvolvimento` criou dev-a administrador e dev-b `engenheiro_obra` com 1 obra, `relforcerowsecurity = t`. `seguranca` r01: 21 de 21 nas classes `ProvisionamentoTestes`, `PrivilegiosPermissaoTestes`, `SementeDesenvolvimentoTestes`, `ObraSemVinculoTestes` e `MatrizPerfilRotaTestes`. `dba` r02: `SET LOCAL lock_timeout = '5s'` (`ProvisionamentoEmpresa.cs:57`) antes do `NO FORCE`; 55P03 com rollback total |
| AC-18 | R18/R19, guarda do helper, lint | T37 `Helper_recusa_politica_de_escrita_na_auditoria`, `Helper_recusa_nome_de_tabela_fora_de_minusculas` (`RlsHelperTestes.cs:53-77`), T43, T78, T79, G-regras, G-lint | sim | PASS | `node --test` 146/146 (`testes` r02) e 160/160 (`arquiteto` r03); 8 alertas esperados. `arquiteto` r03: sonda contra d8b9637, H2 R19@10, H3 R19i@10, H4 R19@10, H5 R19@10, S6 R19@10, H9 R19i@10, M2 R15@10; controles S8 a S11 sem alerta; regras antigas × novas sobre os 163 `.cs` de `server/src`: 10 achados nos dois casos, nenhum novo; a Theory cobre 7 entradas nos 10 métodos públicos |
| AC-19 | Documentação | `git diff --name-only` e leitura | sim | PASS | `testes` r01: ADR 00010, ADRs 00004/00006/00009, `backend-dotnet.md`, checklist, SPEC-01/02/14, PLANO-FASE-2, `CLAUDE.md` e `server/README.md` no diff. `arquiteto` r02: R-4 fechado. `arquiteto` r03: ADR 00009 §6, ADR 00010 e `backend-dotnet.md` coerentes com o código |
| AC-20 | Front intacto; `npm run ci` | `git diff --name-only`; `npm run ci` | sim | PASS | `testes` r01 (796ef21): diff vazio em `src/`, `e2e/`, `Dockerfile`, `docker/`, compose, `.github/` e `.env*`; `npm run ci` verde (lint, tipos, testes, cobertura de `src/lib` 92,79% de linhas, build em 25,9s). `npm run ci` não reexecutado em d6bf1dd nem em d8b9637; o `npm run lint` foi (G-lint); auditoria r01 no HEAD 42f82cf: diff vazio em `src/`, `e2e/`, Docker, compose, `.github/`, `.env*` e dependências; `npm run ci` exit 0 (Vitest 67/67, cobertura de `src/lib` 92,79%, build 19,69s) |
| AC-21 | Contratos | `OpenApiTestes.Contrato_das_rotas_de_dado_declara_exatamente_os_status_do_plano` + leitura contra o §3.7 | sim | PASS | `arquiteto` r01: as 15 rotas de dado com `Results<…>` do que alcançam, status do pipeline em `.ProducesProblem`, OpenAPI regerado bate com o §3.7 (revogar 204/400/401/403/404/413; conceder 201/400/401/403/404/409/413). `testes` r01: teste verde |
| R-1 | Camadas | `ArquiteturaTestes` + leitura | sim | PASS | `arquiteto` r01: `MatrizPermissoes` no `Dominio`, pura; autorização na `Api`; serviços novos scoped |
| R-2 | DDL só em migração e `Rls/`; SQL de escrita auditada só no provisionamento | R15, R18, T43 `Sem_sql_de_escrita_em_tabela_auditada_fora_de_migracao` | sim | PASS | `validar-regras` 0 bloqueia (`testes` r02; `dev-backend` e `arquiteto` r03); T43 dentro da suíte verde (`testes` r02). `MERGE INTO` na R15 em d8b9637 (`arquiteto` r03, caso M2) |
| R-3 | Estilo do ADR 00004 | leitura do `arquiteto` | sim | PASS | R-3 da r01 (dois tipos públicos por arquivo) corrigido em d6bf1dd (`Infra/ResultadoDml.cs`, `Isolamento/SemVinculoDoCenario.cs`); `arquiteto` r02: "nenhum arquivo `.cs` do ciclo tem dois tipos de topo" |
| R-4 | Evidência do HEAD (lição 8) | cada linha cita o SHA | sim | PASS (com ressalva) | gates com SHA em todas as linhas; em d8b9637 a suíte .NET, o build e os gates `dotnet` só pelo `dev-backend`; `node --test` e `validar-regras` também pelo `arquiteto` r03 |
| S-1 | Sem segredo versionado | `ConfiguracaoTestes`, R08 | sim | PASS | `seguranca` r01: "nenhum segredo no diff"; R08 dentro do `validar-regras` com 0 bloqueia (`testes` r02) |
| S-2 | Nenhuma dependência nova | diff de `Directory.Packages.props` e dos lock files | sim | PASS | `testes` r01: vazio; `arquiteto` r01 e `seguranca` r01: nenhum pacote novo |
| S-3 | Atribuição em massa | T62, T65 | sim | PASS | `testes` r01: T62 ignora `empresaId` do corpo |
| S-4 | CSRF nas escritas novas | `Toda_escrita_exige_antiforgery` | sim | PASS | `seguranca` r01: o `FiltroAntiforgery` vale para o grupo `/api/v1` inteiro e cobre as 5 escritas novas; teste dentro da suíte verde |
| S-5 | Erro sem detalhe interno | T62, T66, `Recusa_de_politica_com_obra_ainda_visivel_vira_500_generico_sem_detalhe` | sim | PASS | `seguranca` r01: 403, 404 e 409 em ProblemDetails com `type` curto, sem nome de constraint nem mensagem do PostgreSQL; `seguranca` r02: o 500 do 42501 sai genérico (ver AC-14) |
| S-6 | Limite de corpo | 413 nas 5 escritas novas | sim | PASS | `testes` r01: T62 afirma 413 no `PUT /membros`; `seguranca` r01: corpo das escritas novas limitado a 8 KB. Auditoria r01 (42f82cf): FAIL de evidência (AUD-1), só `MembrosApiTestes.cs:153` provava o 413. Corrigido em 675ef32: Theory `EscritasNovasTestes.Corpo_acima_do_limite_de_8_KB_responde_413_e_nao_grava` nas 5 escritas (corpo de 9 KB, nada gravado); mutação do `dev-backend` (sem o `LimiteDeCorpoMetadata` no `remover`) derruba só o caso dessa rota (`Expected: RequestEntityTooLarge, Actual: BadRequest`) |
| S-7 | Testes de banco como `cronoai_app` (boot só na fixture e nas mutações) | leitura | sim | PASS | declarado pelo `dev-backend` r01 (mutações numa transação do superusuário que nunca confirma, `ScriptRls`); `testes` r02 confirmou o mecanismo dos `*_mutacao`; `arquiteto` r01 (desvio 5): o RLS por obra exige usuário no contexto. Nenhum validador fez a leitura dedicada de todos os testes de banco; auditoria r01 (42f82cf): a fábrica dos testes de banco é a `FabricaApp` (`cronoai_app`); o superusuário só produz estado, roda controles positivos, lê catálogo e aplica mutações com `SET LOCAL ROLE cronoai_app`. Conferido |
| S-8 | String do migrador só no comando de semente, só em `Development` | T35, X8, leitura | sim | PASS | `seguranca` r01: `SementeDesenvolvimento` checa `IsDevelopment` antes de ler `CronoaiMigracao`; a string não fica em campo nem na mensagem de erro; `Semente_recusa_fora_de_Development` passou |
| INV-1 | Inventário dos testes previstos | confronto T01-T79 e X1-X10 | sim | PASS | `testes` r01: nenhum teste previsto ausente (T31 substituído); sem `Skip`, `Sleep`, `Task.Delay`, `[Explicit]` nem `Ignore` em `server/tests` |
| V-1 | **Usuário revisa no PR** o gate (Q1 a Q11, Q3), 404 × 403, células de opinião da matriz, divisão e decisões das rodadas | PR | sim | NOT_RUN | depende do PR |
| V-2 | Subida local: `dev-a` e `dev-b`, 404, 403, conceder, revogar, trocar perfil | compose descartável, HTTPS, curl | não | PASS | `testes` r01 (796ef21; `-p cronoai-qa14`, porta 55414, API em `https://127.0.0.1:18281`): login 204 para os dois; dev-a vê 3 obras, dev-b 1; 404 em obra alheia com corpo igual ao de inexistente; 403 `acao-nao-permitida` em `PUT /obras/{alheia}`, `GET /membros`, `GET .../acessos` e `POST /obras`; conceder 201 e revogar 204; 409 `ultimo-administrador`; limpeza com `down -v` e `git status` limpo. Não refeita depois das rodadas 02 e 03; auditoria r01: não refeita depois das mudanças de comportamento da r02 (AUD-4, NOT_RUN, não obrigatória) |
| E2E | `npm run e2e` | — | não | NA | front intacto |
| R02 | Rodada 02: 3 bloqueantes e 13 itens | `testes`, `arquiteto`, `dba` e `seguranca` sobre d6bf1dd | sim | PASS | `testes` r02 APROVADO (606 2x; D1, D2, M1 a M4 e mutações reais PASS); `dba` r02 APROVADO; `seguranca` r02 APROVADO; `arquiteto` r02 AJUSTAR (R-1 a R-4 fechados; 5 itens novos) → rodada 03 |
| R03 | Rodada 03: R19 (argumento nomeado, caixa, `DROP CONSTRAINT`, `ExecutarDmlComRls`), `ValidarNomeDeTabela`, docs, opcionais | `arquiteto` sobre d8b9637 | sim | PASS | `arquiteto` r03 APROVADO (ver AC-18). Suíte .NET 613/613 declarada pelo `dev-backend`. `testes`, `dba` e `seguranca` não foram acionados |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | A PREENCHER | r01 (42f82cf, 26/10/2026): REPROVADO por 2 Baixos. Gates no HEAD: restore exit 0; build "0 Aviso(s) 0 Erro(s)"; format exit 0; `dotnet test` "total 613, falhou 0, ignorados 0" (12m12s); openapi exit 0; has-pending limpo; vulneráveis: nenhum; `node --test` 160/160; validar-regras "154 arquivo(s) \| 0 bloqueia, 8 alerta"; classificar-diff faixa 3; `npm run ci` exit 0; escopo sem diff no front, Docker, CI e dependências; `*ObrasAuditoria*` vazio; 9/9 commits com o trailer Opus 5.5; 37 de 48 evidências conferidas. Achados AUD-1 (S-6) e AUD-2 (documentação) → 675ef32. Reauditoria: A PREENCHER |

## Ressalvas dos validadores e destino
| Origem | Ressalva | Destino |
|---|---|---|
| testes r01 | Defeito 1: revogar no isolamento sem `acesso_obra` real (passaria com o RLS quebrado) | corrigido (d6bf1dd): recursos reais e `Rotas_de_acesso_com_recursos_reais_discriminam_visibilidade_mutacao`; `testes` r02 D1 PASS |
| testes r01 | Defeito 2: `POST /acessos` com `usuarioId` aleatório, e não membro real de A | corrigido (d6bf1dd): `MembroDoChamador` e `CorpoDosRecursos`; `testes` r02 D2 PASS |
| testes r01 | Ressalva 3: os 2 alertas R19 vêm do Down; o Up não alerta | corrigido (6919a73), junto com o R-1 |
| testes r01 | AC-21: leitura do §3.7 contra os `Results<…>` não feita pelo `testes` | registrado: feita pelo `arquiteto` r01 |
| testes r01 | T14: a mutação afeta ≥4 (limite frouxo, mas prova a dependência) | registrado |
| testes r01 | Antiforgery exige HTTPS (HTTP dá 500); porta 55281 reservada no Windows | registrado (V-2 por HTTPS na porta 18281) |
| testes r02 | Defeito 1: os `*_mutacao` (`ALTER POLICY`) provam a dependência do teste, não a migração | registrado: a mutação real na migração foi feita pelo `testes` r02 e detectada |
| testes r02 | Defeito 2: a mutação do lock troca a função global e depende de `pg_sleep(1)` e da coleção serial | registrado (mesmo ponto do `dba` r02 O2) |
| testes r02 | Defeito 3: `Atomicidade_do_delete_que_falha_o_lote...` só documenta a ordem do lote | registrado |
| testes r02 | `ServicoMembros`, `GanchoUmaVez` e `lock_timeout` lidos só pela existência dos testes | registrado: `seguranca` r02, `arquiteto` r02 e `dba` r02 leram esses pontos |
| arquiteto r01 | R-1 (Média): R19 cega ao helper com `"auditoria"` na linha seguinte; o Up passou sem alerta | corrigido (6919a73): `fecha()` do `r19PorInstrucao` sobre o texto juntado; 8 alertas |
| arquiteto r01 | R-2 (Média): obra restaurada com responsável removido fica sem edição | corrigido (d6bf1dd): `ServicoObras.cs:140-150`; `PermissaoObrasTestes.cs:255` |
| arquiteto r01 | R-3 (Baixa): dois tipos públicos por arquivo | corrigido (d6bf1dd) |
| arquiteto r01 | R-4 (Baixa): ADR 00010 e ADR 00004 sem `empresa` no `NO FORCE`; ADR 00009 §6; "8" × "9 alteradas" | corrigido (6919a73) |
| arquiteto r01 | Desvio 1: Q8 que reutilize o provisionamento pega ACCESS EXCLUSIVE em `empresa` e `membro_empresa` | pendência (Q8, Infraestrutura e Segurança); `lock_timeout` em d6bf1dd |
| arquiteto r01 | Desvio 3: 500 em corrida (`CriarAsync` de obra; gatilho em `ServicoMembros`; `ConcederAsync`); mapear para 403 é opcional | registrado; teste do 500 genérico em d6bf1dd |
| arquiteto r01 | Desvio 5: `DadosTeste.ComoAdministrador` cai em contexto sem usuário | corrigido (d6bf1dd): `DadosTeste.cs:114` lança |
| arquiteto r01 | Desvio 13: 403 de `incluirRemovidos` dentro do handler | corrigido (d6bf1dd): `IAuthorizationService` com `membros.gerir`; registrado no `backend-dotnet.md` e no ADR 00010 |
| arquiteto r01 | Semente cria a obra direto com `SalvarAuditadoAsync`, não pelo `ServicoObras` | registrado (inofensivo) |
| arquiteto r01 | Falta mutação "sem o lock, os dois rebaixamentos passam" | corrigido (d6bf1dd): `MembroTestes.cs:258` |
| arquiteto r02 | 1: R19 não pega helper com argumento nomeado (`tabela: "auditoria"`) | corrigido (d8b9637): `HELPER_DA_TRILHA` com `\([^;]*"auditoria"`; casos H2 e H3 |
| arquiteto r02 | 2: `"Auditoria"` com maiúscula escapa da guarda (`Ordinal`) e da R19 | corrigido (d8b9637): `ValidarNomeDeTabela` e flag `i`; caso H4 e Theory em `RlsHelperTestes` |
| arquiteto r02 | 3: `DROP CONSTRAINT` por SQL bruto na trilha sem alerta | corrigido (d8b9637): casos S6 e H9 |
| arquiteto r02 | 4: `ExecutarDmlComRls("auditoria", ...)` (NO FORCE escondido) sem alerta | corrigido (d8b9637): caso H5 |
| arquiteto r02 | 5: a remoção não revoga `acesso_carteira` | registrado no ADR 00010 (d8b9637); pendência do 00014b |
| arquiteto r02 | Comentário `ServicoObras.cs:152` sem o 400 de responsável | corrigido (d8b9637) |
| arquiteto r02 | Mensagem da R19 por instrução sem helper e CHECK | corrigido (d8b9637) |
| arquiteto r02 | `MERGE` fora da DML da R15 (caso M2) | corrigido (d8b9637): `MERGE INTO` na R15 |
| arquiteto r02 | Corrida remover × conceder: vínculo inerte que reaparece na reativação | pendência (00014b), registrada no ADR 00010 (d8b9637) |
| arquiteto r02 | Ordem 400 de responsável → 403 de campo: oráculo pequeno "UUID é membro ativo" | registrado no ADR 00010 (d8b9637); pendência |
| arquiteto r02 | Limites aceitos da R19: constante ou interpolação do nome (H1, H7, I1), `;` no meio da linha (S2, S3), concatenação (S7); R18 com `INSERT INTO`/`MERGE INTO` e a tabela na linha seguinte (M4, M5) | registrado (a R19 só alerta; o `arquiteto` r03 confirmou que continuam) |
| arquiteto r03 | `MigracaoDeDadosRls.GerarSql` (`MigracaoDeDadosRls.cs:31-33`) monta `{Schema}.{tabela}` sem `ValidarNomeDeTabela`; a frase do ADR 00009 "o helper de RLS recusa..." não vale para esse helper | pendência (00014b) (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR); frase qualificada em `backend-dotnet.md:39` e no ADR 00009 §6 em 675ef32 (AUD-2) |
| auditoria r01 | AUD-1 [Baixo]: S-6 afirmava 413 nas escritas novas, mas só o `PUT /membros` tinha teste; tirar o limite das outras 4 não reprovava nada | corrigido (675ef32): Theory nas 5 escritas, com mutação |
| auditoria r01 | AUD-2 [Baixo]: `backend-dotnet.md:39` dizia que o helper de RLS recusa nome fora do padrão, o que não vale para `ExecutarDmlComRls`/`GerarSql`; a pendência só citava o ADR 00009 | corrigido (675ef32): frase qualificada nos dois documentos; validação no `GerarSql` segue pendência do 00014b |
| auditoria r01 (observação) | Desvio 4 citava `ServicoMembros.cs:248`, linha de 796ef21 (`:257` desde d6bf1dd) | corrigido neste registro |
| auditoria r01 (observação) | V-2 não refeita depois das mudanças de comportamento da r02 (AUD-4) | registrado (item não obrigatório) |
| auditoria r01 (observação) | 11 linhas PASS cobertas só pela suíte verde no HEAD, sem leitura do corpo do teste (AC-6, AC-8, AC-10, AC-12, AC-17, AC-19, R-1, S-4, S-5, INV-1, V-2) | registrado |
| dba r01 | 1 (MÉDIA): T36 com `SubPlan\|InitPlan` não prova o padrão | corrigido (d6bf1dd): afirma `hashed SubPlan` no admin e no engenheiro; negativo retirado (r02-b) |
| dba r01 | 2 (MÉDIA): R19 não alerta o Up nem o DROP/ADD de `ck_auditoria_acao` | corrigido (6919a73), junto com o R-1 |
| dba r01 | 3: R19 nas linhas 595-596 (Down): falso positivo aceitável | registrado (alertas esperados e conferidos) |
| dba r01 | 4 (BAIXA, MÉDIA para produção): DROP/ADD de `ck_auditoria_acao` varre `auditoria` sob ACCESS EXCLUSIVE | pendência (Infraestrutura: `NOT VALID` + `VALIDATE` antes de dado real) |
| dba r01 | 5 (BAIXA): gatilho do último administrador (READ COMMITTED, lock de duas chaves, teste de concorrência legítima) | corrigido (d6bf1dd): `PerfisPermissoes.cs:431-443`, `MembroTestes.cs:236` e `:258`. O 5b (lock em todo UPDATE de membro, `WHEN` opcional) fica registrado |
| dba r01 | 6 (BAIXA): `ProvisionamentoEmpresa` sem `lock_timeout` | corrigido (d6bf1dd): `ProvisionamentoEmpresa.cs:57`; Q8 não herda o padrão (ADR 00010, ADR 00004) |
| dba r01 | 7 (BAIXA): SELECT da `auditoria` com `IN (hashed SubPlan)` dentro de OR, sem índice; medir no 00015 | pendência |
| dba r01 | 8 (BAIXA): `lerVinculo` largo para o gestor; INSERT da trilha sem obra por qualquer membro | corrigido (d6bf1dd): `PerfisPermissoes.cs:498` e `:542` |
| dba r01 | 9 (BAIXA): índices redundantes (`ix_frente_empresa_obra`, `ix_acesso_obra_usuario` e índices de FK pelo lado do pai) | pendência (podar com medição real) |
| dba r01 | 10 (INFO): `trg_membro_exige_administrador` recusa UPDATE de membro feito pelo migrador sem contexto em migração futura | pendência (00014c e migrações futuras) |
| dba r01 | T34 não compara gatilhos, funções nem o CHECK além da ausência de `remover` | registrado (baixo) |
| dba r02 | O1 (opcional): afirmar que não aparece `SubPlan N` sem `hashed` | registrado |
| dba r02 | O2 (opcional): a mutação troca a função do banco compartilhado; se o processo morrer, ela fica sem lock | registrado (container efêmero) |
| dba r02 | O3: corrida da remoção com concessão concorrente (23001 no DELETE → 500; vínculo inerte) | pendência (00014b): gatilho `BEFORE INSERT` mais 23001 → 409 |
| dba r02 | R19: nome da tabela por variável ou constante escapa | registrado (mesmo limite do `arquiteto` r02) |
| seguranca r01 | 1 (Baixo): gestor lê os vínculos de toda a empresa | corrigido (d6bf1dd): `AlcanceGestor("obra_id")`; mutação em `RlsPermissaoTestes.cs:367` |
| seguranca r01 | 2 (Info): reativar devolve as obras antigas | corrigido (d6bf1dd): a remoção revoga `acesso_obra` e `acesso_frente` (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| seguranca r01 | 3 (Info): 42501 com obra visível só com teste unitário | corrigido (d6bf1dd): teste de integração (`AcessosObraApiTestes.cs:180`) |
| seguranca r01 | 4 (Info): `ON CONFLICT (id) DO NOTHING` permite tomar empresa existente se a Q8 reutilizar | corrigido (d6bf1dd) no comentário e no ADR 00010: a Q8 TEM de recusar empresa existente |
| seguranca r01 | 5 (Info): oráculo de membro ativo pela diferença 400 × 404/409/403 no PUT de obra | pendência (registrado no ADR 00010 em d8b9637) |
| seguranca r01 | 6 (Info): escritas novas sem limite de taxa por usuário | pendência (dívida, item [P] do checklist) |
| seguranca r01 | 7 (Info): políticas de INSERT/UPDATE de `frente` só exigem obra visível (diretoria e suprimentos escreveriam no banco) | pendência (00014b: ação na matriz) |
| seguranca r01 | 8 (Info): backfill Q10 torna administrador todo membro existente | pendência (Infraestrutura confere a contagem antes de aplicar fora do local) |
| seguranca r02 | Baixo 1: corrida remover × conceder | pendência (00014b), registrada no ADR 00010 (d8b9637) |
| seguranca r02 | Baixo 2: remoção não revoga `acesso_carteira` | pendência (00014b TEM de revogar), registrada no ADR 00010 (d8b9637) |
| seguranca r02 | Info 1: em `Development` a página de exceção e, no log Error, a mensagem do Npgsql citam tabela e política | registrado (nada chega ao cliente) |
| seguranca r02 | Info 2: quem lê a trilha da obra vê os `usuario_id` dos vínculos concedidos e revogados | registrado (decisão do ADR) |
| dev-backend r01 | Node v26 usado localmente (o repositório pede 22 ou superior) | registrado |
| dev-backend r01 | O `Down` só vale em banco sem trilha `remover` | pendência (Infraestrutura); registrado no ADR 00010 |

## Pendências registradas
- **00014b TEM de revogar `acesso_carteira` na remoção do membro,** na mesma transação e com trilha `remover`. Registrado no ADR 00010 (Negativas).
- **Corrida remover × conceder (00014b):** um `acesso_obra`/`acesso_frente` concedido ao mesmo tempo em que o membro é removido fica inerte, mas reaparece na reativação; e a concessão de frente concorrente pode dar 23001 no DELETE (500). Correção: gatilho `BEFORE INSERT` em `acesso_obra` e `acesso_frente` que recuse membro removido sob o advisory lock por empresa, mais o mapeamento do 23001 para 409. Registrado no ADR 00010.
- **Oráculo 400 × 403:** o engenheiro que troca o responsável recebe 400 (membro inválido) antes do 403 de campo, o que revela se um UUID é membro ativo. Só com UUID já conhecido; aceito e registrado no ADR 00010.
- **`MigracaoDeDadosRls.GerarSql` sem `ValidarNomeDeTabela` (00014b):** `ExecutarDmlComRls("Auditoria", ...)` só é pego pelo alerta da R19. Chamar a mesma validação em `GerarSql` e ajustar a frase do ADR 00009.
- **Observações do `dba` r01:**
  - 4: `NOT VALID` + `VALIDATE` do `ck_auditoria_acao` antes de dado real (momento da Infraestrutura);
  - 7: SELECT da trilha com `IN (hashed SubPlan)` dentro de OR; a consulta de não administrador deve filtrar `obra_id` e usar `ix_auditoria_empresa_obra_em`; medir no 00015;
  - 9: índices redundantes; podar com medição real;
  - 10: o gatilho de administrador recusa UPDATE de membro pelo migrador sem contexto em migração futura (00014c).
- **Observações da `seguranca` r01:**
  - 5: oráculo de membro ativo no PUT de obra (acima);
  - 6: escritas novas sem limite de taxa por usuário;
  - 7: o banco deixa diretoria e suprimentos escreverem `frente`; o 00014b precisa da ação na matriz;
  - 8: backfill Q10 com conferência da Infraestrutura.
- **Q8 em produção (Infraestrutura e produto):** nenhum caminho de produção cria empresa nem primeiro administrador. O comando explícito, com credencial dedicada, TEM de recusar empresa existente e não herda o `NO FORCE` sem a Infraestrutura.
- **00014c bloqueado pelo parecer da Segurança sobre a Q6** (convite por token e exposição de `emissor` + `sujeito`), conforme o plano §9.1, §13 e o gate.
- **Escopo `carteiras`** enxerga zero obras até o 00014b (falha fechada).
- **RF-02.3a não cumprido neste ciclo:** "encarregado só vê as suas frentes" depende das tabelas filhas (00015/00018).
- **Registros menores:** `dba` r02 O1 e O2; `seguranca` r02 Info 1 e 2; limites aceitos da R19; T34 sem comparar gatilhos e funções; desvio 3 (500 em corrida).
- **Revalidação da r03:** só o `arquiteto` revisou d8b9637; `testes`, `dba` e `seguranca` não foram acionados. A auditoria r01 reexecutou a suíte .NET no HEAD 42f82cf (613/613) e conferiu `RlsHelperTestes.cs:53-77` e os nomes de tabela das 4 migrações.
- **Herdado do 00013, ainda aberto** (ver "Pendências registradas" do registro do 00013):
  - V-1 do 00013: conferir os 27 códigos de UF contra a fonte oficial do IBGE (bloqueia o merge do 00013, base deste PR);
  - recriar o banco local de quem migrou antes da troca do id da `ObrasAuditoria`;
  - observações 4 a 6 do `dba` r01 do 00013 e o `EXPLAIN (ANALYZE, BUFFERS)` com volume;
  - Info da `seguranca` do 00013 (`PoliticaUpdate("auditoria")` fora da R19, coberto agora pela R19 ampliada e pela guarda do helper; `＝` de largura total no Excel pt-BR; cursor não assinado; uma cota por conta). O item "leitura da trilha por todo membro e o 409 de nome duplicado" foi tratado neste ciclo (AC-8 e AC-11);
  - lista oficial de municípios (insumo do usuário);
  - teste da regra do ROLLBACK no 00015;
  - `Content-Disposition` sem aspas;
  - limite de 64 KB provado só no TestServer;
  - herdados do 00012.
- **Antes do PR:** fazer merge da `master`. PR empilhado em `feat/00013-obras-auditoria` se o 00013 não tiver entrado.

## Validação de outras áreas (não substitui o parecer delas)
- **Segurança da Informação:**
  - Q6: convite por token × e-mail verificado e exposição de `emissor` + `sujeito` dos colegas. **Bloqueia o início do 00014c;**
  - gatilho `trg_membro_exige_administrador` como controle de autorização (o dono e o superusuário contornam);
  - uso da credencial do migrador na semente de desenvolvimento e no futuro comando da Q8;
  - aceite dos itens ASVS 5.0.0 V2, V4, V7, V8, V14 e V16.
- **RH + Jurídico:**
  - perfil Encarregado (login de trabalhador, dados mínimos): nenhuma rota coloca alguém nesse perfil;
  - `responsavel_texto` guarda nome de trabalhador em texto livre (fora da trilha e dos logs); nenhum nome real sem aval;
  - nomes de frente e de carteira (tipo "gestor") podem conter nome de pessoa e vão para a trilha append-only.
- **Jurídico:**
  - `removido_em` basta para o desligamento, ou o titular pode pedir pseudonimização do `usuario`? (Q11);
  - retenção do convite consumido (00014c);
  - minimização do `motivo` para quem não é autor nem administrador.
- **Infraestrutura:**
  - Q8 (com o produto): como nasce a empresa e o primeiro administrador fora do desenvolvimento, com credencial dedicada; não reutilizar o `NO FORCE` do provisionamento sem avaliação (ACCESS EXCLUSIVE em `empresa` e `membro_empresa`);
  - Q10: contagem de membros por empresa antes de aplicar a migração fora do local (o backfill torna todos administradores);
  - momento de `NOT VALID`/`VALIDATE` e locks da migração (`ck_auditoria_acao`);
  - o `Down` da `PerfisPermissoes` só vale em banco sem trilha `remover`;
  - herdados do 00013 (proxy e IP real, quem roda migração em produção, backup sob RLS, PgBouncer em modo de transação, limite global de corpo).
- **Usuário (V-1, antes do merge):** 404 × 403 para obra sem vínculo (nota na SPEC-02, sem reescrever o critério); Q3; células de opinião da matriz (§3.5); divisão em 00014/00014b/00014c; decisões das rodadas 02 e 03.
