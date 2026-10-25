---
issue: —
spec: SPEC-02 — RF-02.2, RF-02.3, RF-02.3a (modelo e vínculo; o filtro de dado por frente nasce com as tabelas filhas); SPEC-01 — RF-01.1c (modelo no banco); SPEC-14 — RF-14.8 (modelo no banco; API no 00014b); SPEC-12 — RF-12.9 (logs sem dado pessoal); RNF-02.3 (nenhum telefone; minimização); ASVS 5.0.0 V2, V4, V7, V8, V14, V16; PLANO-FASE-2 §5.4, §8.2, §8.3
ciclo: .claude/ciclos/00014-perfis-permissoes.md
branch: feat/00014-perfis-permissoes
base: feat/00013-obras-auditoria (HEAD 1c7cea7, já com push). PR empilhado enquanto o 00013 não entrar na master (prompts/00-regras-comuns.md › BASE)
faixa: 3
status: rascunho para o gate (decisões Q1 a Q11, 404 x 403 e divisão do ciclo tomadas pelo orquestrador com autorização do usuário, sujeitas à revisão dele no PR)
data: 2026-10-25
destino: .claude/ciclos/00014-perfis-permissoes-plano.md (este rascunho foi gravado fora do repositório; a worktree c13 e a branch feat/00013-obras-auditoria não foram tocadas)
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00014 — Perfis, matriz perfil × ação, permissão por obra e gestão de membros

## Resumo
- **O que é:** cada membro da empresa passa a ter um perfil (os 7 da SPEC-02 §3) e um escopo de obras. O banco decide **quais obras** cada um enxerga (RLS por obra). O código decide **o que** cada perfil pode fazer (matriz perfil × ação em tabela de código, aplicada por políticas de autorização do ASP.NET Core).
- **Entram neste ciclo (recorte recomendado, seção 09):**
  - o modelo de dados completo do parecer do `dba`, **menos** o convite e o `usuario` sob RLS: perfil, escopo e remoção lógica em `membro_empresa`; tabelas `acesso_obra`, `frente`, `acesso_frente`, `carteira`, `carteira_obra` e `acesso_carteira`;
  - RLS por obra, trilha de auditoria lida conforme a visibilidade da obra, gatilho do último administrador;
  - **escalada de privilégio fechada:** o papel da aplicação deixa de inserir em `membro_empresa` (privilégio revogado e política removida);
  - a matriz aplicada às 8 rotas existentes (obra sem vínculo → **404**; ação não permitida → **403**);
  - 7 rotas novas: gestão de membros (listar, trocar perfil, remover, reativar) e acessos de obra (listar, conceder, revogar).
- **Risco que justifica a faixa 3:** T8 (banco, RLS, gatilhos, privilégios, migração, autorização) e T5 (dado pessoal: nomes na listagem de membros, `responsavel_texto` da frente, trilha de membros).
- **Parecer do `dba` (tarefa 0):** `00014-tarefa0-dba.md`, `VEREDITO: AJUSTAR`. As 11 recomendações foram adotadas (seção 15). Há **um ajuste técnico** em cima do parecer: política de `membro_empresa` que consulta a própria tabela dispara recursão (42P17). A checagem "só administrador altera membro" vira gatilho (§3.4).
- **Divisão (seção 09):** o escopo pedido passa de M/G. **Recomendação:** três ciclos empilhados. Este (00014); depois o **00014b** (API de frentes, acessos de frente e carteiras, sobre o banco já pronto); depois o **00014c** (convite e `usuario` sob RLS, depois do parecer da Segurança).
- **O que você precisa fazer:**
  1. no gate, aprovar a divisão (ou escolher outra opção da seção 09);
  2. no PR, revisar as decisões do gate (seção 15) e a divergência **404 × 403** da SPEC-02;
  3. levar à Segurança, ao Jurídico e ao RH os itens da seção 13, antes de qualquer uso fora da máquina local.

## 00. Contexto para execução (ler antes de começar)
| Arquivo | Por quê |
|---|---|
| `.claude/ciclos/00014-tarefa0-dba.md` (inteiro) | Parecer deste ciclo: colunas, CHECKs, FKs compostas, políticas, índices, migração e testes T1 a T20. **Leitura obrigatória** para o E1. Os desvios do parecer estão na seção 16 deste plano |
| `.claude/ciclos/00013-obras-auditoria.md` › "Ressalvas" e "Desvios" | O que os validadores e a auditoria acharam em 3 rodadas. As lições já estão neste plano (§11.0) |
| `.claude/adrs/00006-isolamento-entre-empresas-rls.md` | Camadas, `FORCE`, subconsulta escalar `U`/`E`, "carregar antes de atualizar", 404 para recurso alheio, `ExecutarDmlComRls`, notas para o 00014 |
| `.claude/adrs/00009-trilha-de-auditoria-append-only-e-concorrencia-da-obra.md` | Append-only em três camadas, `SalvarAuditadoAsync`, lista branca, "a trilha entra no lote antes do `UPDATE`" |
| `.claude/adrs/00004-estrutura-convencoes-backend.md` | Convenções de banco, `xmin` para entidade sem filhos, estilo C# (`#region`, construtor explícito, um tipo por arquivo) |
| `server/src/CronoAI.Dados/Rls/MigrationBuilderRlsExtensoes.cs` | Helper de políticas. Ganha guarda (recusar escrita na `auditoria`), substituição de política e as expressões de permissão (§3.3) |
| `server/src/CronoAI.Dados/Rls/MigracaoDeDadosRls.cs` | `ExecutarDmlComRls` (backfill do perfil) e o padrão `NO FORCE → DML → FORCE` reaproveitado pelo provisionamento de desenvolvimento (§3.8) |
| `server/src/CronoAI.Dados/Migrations/20261025113548_IdentidadeEmpresas.cs` (linhas 138-161) e `20261025201449_ObrasAuditoria.cs` (linhas 282-339) | Predicados atuais. O `Down()` do 00014 os restaura **literalmente**. **Não editar** essas migrações: já estão na branch remota (lição 9) |
| `server/src/CronoAI.Dados/Auditoria/AuditoriaInterceptor.cs` (linhas 85-87, 130-147) | Lança em `Deleted`; `obra_id` só para `Obra`; ação derivada só para `Obra`. Os três pontos são estendidos (§3.6) |
| `server/src/CronoAI.Dados/Auditoria/ListaBrancaAuditoria.cs` | Ganha as 7 entidades. `responsavel_texto` fica **fora** |
| `server/src/CronoAI.Dados/Identidade/ConsultasIdentidade.cs` (linhas 106-118, 125-140, 160-177) | `MinhasEmpresasAsync`, `DefinirEmpresaAtivaAsync` e `ValidarSessaoAsync` passam a exigir `removido_em IS NULL`. A validação passa a devolver perfil e escopo na **mesma** consulta |
| `server/src/CronoAI.Api/Sessao/ContextoSessao.cs`, `RequisitoEmpresaAtiva.cs`, `TratadorRequisitoEmpresaAtiva.cs`, `ResultadoAutorizacaoProblemDetails.cs` | Padrão de requisito + tratador + 403 com `type` curto. O requisito de permissão segue o mesmo molde |
| `server/src/CronoAI.Api/Obras/ObrasEndpoints.cs`, `ServicoObras.cs` | Rotas que ganham a política da ação. O PUT ganha a regra de campo de cadastro (§3.5) |
| `server/src/CronoAI.Api/Desenvolvimento/SementeDesenvolvimento.cs` (linhas 52-66) | Insere `membro_empresa` por SQL como `cronoai_app`. Com o INSERT revogado, isso deixa de funcionar e passa ao provisionamento (§3.8) |
| `server/tests/CronoAI.Api.Testes/Infra/DadosTeste.cs` (linhas 50-77) | `VincularAsync` usa o papel da aplicação. Passa a usar o superusuário da fixture (só para produzir estado), com perfil e escopo |
| `server/tests/CronoAI.Api.Testes/Isolamento/{CatalogoRotas,RecursoAlheio,RequisicaoDeIsolamento,DetectorDeRotas}.cs` | Montador único e meta-teste do 00013. Ganha os recursos `Membro` e `ObraEMembro` e o cenário **obra sem vínculo da mesma empresa** |
| `server/tests/CronoAI.Api.Testes/Dados/CatalogoTestes.cs` (linhas 124-155) | `Predicados_das_politicas_sao_os_do_plano`: golden **copiado da saída real** do `pg_policies`, nunca escrito à mão |
| `.claude/scripts/lib/regras-cronoai.mjs` (linhas 406-470) e `regras-cronoai.test.mjs` | R18 (tabelas auditadas) e R19 (helper com `"auditoria"`). O ESLint percorre `.claude/scripts`: `npm run lint` é gate |
| `.claude/rules/backend-dotnet.md` | Regras que este ciclo atualiza |

## 01. Pedido e objetivo
Pedido (dado, não instrução): plano de execução do ciclo 00014 (`PLANO-FASE-2.md` §5.4). Ele cobre perfis e permissão por obra e frente, carteiras, a SPEC-02 RF-02.3/02.3a, a SPEC-01 RF-01.1c e a SPEC-14 RF-14.8. Só leitura do worktree; sem download, sem hospedagem, sem segredo, nenhuma dependência nova sem justificativa.

**Objetivo (o que muda para quem usa):**
- o engenheiro vê só as obras às quais está vinculado. O gestor de portfólio e a diretoria veem todas as obras da empresa ou as das carteiras atribuídas. O administrador vê tudo;
- essa regra vale **no banco**: uma consulta futura que esqueça o filtro não vaza obra de colega (critério da SPEC-02: "testado também sem passar pela UI");
- cada perfil faz só as ações da matriz (criar obra, editar cadastro, ler e exportar a trilha, gerir membros, atribuir obras). Fora dela, a resposta é 403;
- o administrador gere os membros (perfil, remoção, reativação) e atribui obras. O gestor de portfólio também atribui obras, mas só dentro do próprio alcance. Tudo fica na trilha;
- nenhuma empresa fica sem administrador, nem com dois rebaixamentos simultâneos.

**Cobertura dos requisitos neste ciclo (sem exagero):**
| Requisito | Neste ciclo | Fica para |
|---|---|---|
| RF-02.2 (autorização no backend) | **Coberto** para as rotas existentes e as novas | — |
| RF-02.3 (permissão por obra) | **Coberto** (vínculo, escopo `todas` e escopo `carteiras` no banco) | Criar carteiras pela API: 00014b. Até lá, escopo `carteiras` enxerga zero obras (falha fechada) |
| RF-02.3a (permissão por frente) | **Só o modelo e o vínculo** (`frente`, `acesso_frente`, FKs, RLS de escrita). **"Encarregado só vê as suas frentes" NÃO está cumprido:** ainda não há dado de frente (tarefa é 00015, relato é 00018) | API: 00014b. Filtro por frente: 00015/00018 (parecer §1.3 e §2.4) |
| RF-01.1c (frentes) | Modelo no banco | API: 00014b |
| RF-14.8 (carteiras e atribuição) | Modelo no banco e atribuição de **obra** a engenheiros pela API | Carteiras e atribuição de frente pela API: 00014b |
| E4 do PLANO (gestão de membros) | Remoção, troca de perfil e reativação | Convite: 00014c |

## 02. Triagem
Confirmada por leitura da worktree `c13` (HEAD 1c7cea7), sem alterar nada.
- **T1 NÃO:** sem cálculo.
- **T2 NÃO:** sem SINAPI.
- **T3 NÃO:** nenhum formato de arquivo novo. A exportação CSV muda só de autorização (o formato é o mesmo).
- **T4 NÃO:** `src/` intacto.
- **T5 SIM:**
  - dado pessoal: nome de exibição na listagem de membros e `responsavel_texto` da frente, que pode receber o nome de um trabalhador (Q2);
  - trilha append-only de membros e vínculos;
  - corpo JSON das rotas novas.
- **T6 NÃO.**
- **T7 NÃO:** compose, Dockerfile, workflows e `.env.example` não mudam. A string do migrador já existe no desenvolvimento.
- **T8 SIM:**
  - 6 tabelas novas e 1 alterada;
  - cerca de 30 políticas (novas e substituídas);
  - 4 gatilhos;
  - privilégios por coluna;
  - autorização por perfil;
  - 7 rotas novas e 9 alteradas (8 de obra e trilha + `/eu`).

**Faixa 3.** Validadores: `arquiteto`, `dba`, `seguranca`, `testes` e auditoria independente (`revisor` em modo AUDITAR). `especialista-obra`: não exigido (T1/T2/T3 = NÃO).

## 03. Decisões de design
Legenda (vale para o plano inteiro):
- **[doc]** = prática documentada, com link;
- **[opinião]** = escolha da equipe, discutível;
- **[exigência]** = requisito de SPEC, ADR ou decisão do gate. Nada aqui é exigência regulatória;
- **conferir** = comportamento que o dev confirma com teste antes de escrever o código definitivo.

### 3.1 Camadas e onde cada peça mora
Busquei equivalentes antes de propor peças novas:
- **há:** `RequisitoEmpresaAtiva` + tratador (molde da autorização); `ServicoObras` (molde do serviço scoped); `MapeadorErrosObra` (molde do mapeamento por nome de constraint); `ExecutarDmlComRls` (molde do provisionamento); `LimitadorDeExportacao` (cota por usuário);
- **não há:** matriz de permissão, serviço de membros, interface de dado de obra, nem remoção física auditada.

| Peça | Onde | Motivo |
|---|---|---|
| `Perfis`, `EscoposObras`, `TiposCarteira`, `AcoesPermissao` (constantes `const string`), `MatrizPermissoes` (pura, sem dependência) | `server/src/CronoAI.Dominio/` | A matriz é regra de negócio testável sem banco nem ASP.NET [exigência: PLANO §5.4 "tabela em código"; ADR 00004 "Dominio sem pacote"] |
| `MembroEmpresa` (alterada), `AcessoObra`, `Frente`, `AcessoFrente`, `Carteira`, `CarteiraObra`, `AcessoCarteira`; interfaces `IDadoDeObra`, `IVinculoRemovivel`, `IArquivavel`, `IRemovivelLogicamente` | `server/src/CronoAI.Dominio/` | Entidades com fábrica e validação, como `Obra` |
| Configurações EF, interceptor estendido, lista branca | `server/src/CronoAI.Dados/` | Infraestrutura de dados (padrão do 00013) |
| `ExpressoesPermissao` (fragmentos SQL das políticas), `SubstituirPolitica*`, guarda da `auditoria` | `server/src/CronoAI.Dados/Rls/` | Único lugar autorizado a montar DDL de RLS (R15). Expressões só no helper, nunca copiadas à mão (parecer §6.1 risco 3) |
| `ProvisionamentoEmpresa` | `server/src/CronoAI.Dados/Rls/` | Usado só pela semente de desenvolvimento (§3.8). É a primitiva que o comando de produção da Q8 poderá usar quando a Infraestrutura definir a credencial |
| `RequisitoPermissao`, `TratadorRequisitoPermissao`, `PoliticasPermissao` (registro de uma política por ação) | `server/src/CronoAI.Api/Sessao/` | Mesmo molde de `RequisitoEmpresaAtiva` |
| `ServicoMembros`, `ServicoAcessosObra` (scoped), endpoints, contratos, `MapeadorErrosMembros` | `server/src/CronoAI.Api/Membros/`, `server/src/CronoAI.Api/Acessos/` | Fluxo carregar → conferir → aplicar → salvar auditado → mapear, como `ServicoObras` |

Direção `Api → Dados → Dominio` mantida [exigência, ADR 00004]. Serviços novos são **scoped**: dependem do `CronoDbContext` e do `ContextoSessao` da requisição. Singleton aqui capturaria serviço scoped e vazaria empresa entre requisições (mesmo comentário do `Program.cs`, linha 47).

### 3.2 Perfil, escopo e remoção em `membro_empresa` (Q1, Q10)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Um perfil por membro** (por empresa), coluna `perfil text` + CHECK com os 7 valores | Perfil por vínculo de obra | **Q1, recomendação do parecer §1.1.** A SPEC-02 não pede perfil diferente por obra. Por obra dobraria o RLS e a matriz. Se a obra real exigir, vira `acesso_obra.perfil` em migração futura [opinião do `dba`, adotada] |
| **`escopo_obras text`** (`todas`, `vinculadas`, `carteiras`) + CHECK do par perfil × escopo (parecer §1.1) | A política citar os 7 perfis | O banco precisa saber **quais obras** o membro vê. Se as políticas citassem os perfis, a matriz ficaria duplicada e divergiria. O banco conhece `administrador` e, pela Q3, `gestor_portfolio` (§3.3) [opinião do `dba`, adotada] |
| Valores do CHECK = constantes C# (teste lê `pg_get_constraintdef`) | Tabela `perfil` com FK | Sem semente em migração e sem ganho: a matriz é código (parecer §1.1) |
| **Remoção lógica** (`removido_em`), `DELETE` segue revogado | `DELETE` do vínculo | Parecer §1.8: a FK de `sessao` e as de responsável apontam para o membro. A sessão do removido cai **na próxima requisição**, porque `ValidarSessaoAsync` passa a exigir `removido_em IS NULL` |
| `atualizado_em` nova, backfill = `criado_em` | — | Parecer §1.1 |
| **Concorrência por `xmin`** exposto como `versao` (inteiro, só igualdade) no corpo de `PUT .../membros/{usuarioId}`, `remover` e `reativar` | Contador explícito; sem versão | [exigência, ADR 00004: "`xmin` como versão da linha, para entidade sem filhos"; SPEC-01 RF-01.4: toda escrita envia a versão]. Npgsql: `IsRowVersion()` mapeia `xmin` [doc: [Npgsql concurrency](https://www.npgsql.org/efcore/modeling/concurrency.html)]. **Conferir** com teste: o `UPDATE ... WHERE xmin = @v RETURNING xmin` funciona com `GRANT UPDATE` só por coluna |
| **Backfill Q10:** todo membro existente vira `administrador` com escopo `todas` | Só o mais antigo vira administrador | **Q10, recomendação do parecer §4.2.** Hoje só existem membros da semente de desenvolvimento. **Antes de aplicar fora do local, a Infraestrutura confere** `SELECT empresa_id, count(*) FROM membro_empresa GROUP BY 1` (seção 13) |
| Perfil `encarregado` existe no CHECK e na matriz, mas **nenhuma rota do 00014 coloca alguém nesse perfil** (400 `perfil-indisponivel`) | Liberar o perfil já | **Q2, recomendação do parecer §6.2:** sem login de trabalhador até RH e Jurídico liberarem. O CHECK fica pronto para o futuro; os testes de banco criam encarregado fictício pela fixture |

### 3.3 RLS por obra: visibilidade no banco, ação na aplicação (parecer §2)
**Divisão [opinião do `dba`, adotada; apoio em [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) e no [IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)]:**
- **banco = visibilidade:** "este usuário enxerga esta obra"; "só administrador (ou gestor, no alcance) concede acesso";
- **aplicação = ação:** a matriz perfil × ação [doc: [ASP.NET Core policy-based authorization](https://learn.microsoft.com/aspnet/core/security/authorization/policies)];
- o banco **não** replica a matriz.

**Limite honesto (vai para o ADR 00010):** a variável de sessão não é segredo. O RLS por obra protege contra erro de código, não contra quem executa SQL livre com a credencial de `cronoai_app`. Job sem usuário no contexto vê zero obras (falha fechada; 00022/00023 decidem).

**Fragmentos** (constantes em `Rls/ExpressoesPermissao.cs`; `E` e `U` são as subconsultas escalares existentes; nomes de tabela qualificados `cronoai.`):
```
MEU(cond)  = EXISTS (SELECT 1 FROM cronoai.membro_empresa m
                      WHERE m.empresa_id = E AND m.usuario_id = U AND m.removido_em IS NULL AND cond)
ADMIN      = MEU(m.perfil = 'administrador')
GESTOR     = MEU(m.perfil = 'gestor_portfolio')
TODAS      = MEU(m.escopo_obras = 'todas')
OBRAS_VINCULADAS   = SELECT a.obra_id FROM cronoai.acesso_obra a
                       JOIN cronoai.membro_empresa m ON m.empresa_id = a.empresa_id AND m.usuario_id = a.usuario_id
                      WHERE a.empresa_id = E AND a.usuario_id = U AND m.removido_em IS NULL AND m.escopo_obras = 'vinculadas'
CARTEIRAS_MINHAS   = SELECT ac.carteira_id FROM cronoai.acesso_carteira ac
                       JOIN cronoai.membro_empresa m ON m.empresa_id = ac.empresa_id AND m.usuario_id = ac.usuario_id
                      WHERE ac.empresa_id = E AND ac.usuario_id = U AND m.removido_em IS NULL AND m.escopo_obras = 'carteiras'
OBRAS_DAS_CARTEIRAS = SELECT co.obra_id FROM cronoai.carteira_obra co
                       JOIN cronoai.carteira c ON c.empresa_id = co.empresa_id AND c.id = co.carteira_id AND c.arquivada_em IS NULL
                      WHERE co.empresa_id = E AND co.carteira_id IN (CARTEIRAS_MINHAS)
ALCANCE_GESTOR(col) = GESTOR AND (TODAS OR col IN (OBRAS_DAS_CARTEIRAS))
OBRA_VISIVEL(col)   = col IN (SELECT o.id FROM cronoai.obra o)   -- só em tabela que a política de obra NÃO cita
```

**Políticas** (todas `TO cronoai_app`, por comando, `WITH CHECK` explícito; "=" significa o mesmo predicado no `USING` e no `WITH CHECK`):
| Tabela | SELECT (`USING`) | INSERT (`WITH CHECK`) | UPDATE | DELETE (`USING`) |
|---|---|---|---|---|
| `empresa` (substitui SELECT) | `id = E OR EXISTS (membro m WHERE m.empresa_id = empresa.id AND m.usuario_id = U AND m.removido_em IS NULL)` | inalterada (`id = E`) | — | — |
| `membro_empresa` | **inalterada** (`usuario_id = U OR empresa_id = E`) | **removida** + `REVOKE INSERT` | **nova:** `empresa_id = E` (=) + gatilho de administrador (§3.4) | — |
| `obra` (substitui as 3) | `empresa_id = E AND (TODAS OR id IN (OBRAS_VINCULADAS) OR id IN (OBRAS_DAS_CARTEIRAS))` | `empresa_id = E AND TODAS` | o predicado do SELECT (=) | — |
| `acesso_obra` | `empresa_id = E AND (usuario_id = U OR ADMIN OR GESTOR)` | `empresa_id = E AND (ADMIN OR ALCANCE_GESTOR(obra_id))` | sem política (privilégio revogado) | igual ao INSERT |
| `frente` | `empresa_id = E AND OBRA_VISIVEL(obra_id)` | idem | idem (=) | sem política (revogado) |
| `acesso_frente` | `empresa_id = E AND (usuario_id = U OR ADMIN OR GESTOR)` | `empresa_id = E AND (ADMIN OR ALCANCE_GESTOR(obra_id))` | sem política (revogado) | igual ao INSERT |
| `carteira` | `empresa_id = E AND (TODAS OR id IN (CARTEIRAS_MINHAS))` | `empresa_id = E AND ADMIN` | `empresa_id = E AND ADMIN` (=) | sem política (revogado) |
| `carteira_obra` | `empresa_id = E AND (TODAS OR carteira_id IN (CARTEIRAS_MINHAS))` | `empresa_id = E AND ADMIN` | sem política (revogado) | igual ao INSERT |
| `acesso_carteira` | `empresa_id = E AND (usuario_id = U OR ADMIN)` | `empresa_id = E AND ADMIN` | sem política (revogado) | igual ao INSERT |
| `auditoria` (substitui as 2) | `empresa_id = E AND ((obra_id IS NULL AND ADMIN) OR (obra_id IS NOT NULL AND OBRA_VISIVEL(obra_id)))` | `empresa_id = E AND usuario_id = U AND (obra_id IS NULL OR OBRA_VISIVEL(obra_id))` | **nenhuma** | **nenhuma** |

**Regras de recursão (vão para o ADR 00010):**
- o PostgreSQL recusa a expansão de política que volta a uma tabela já em expansão, com o erro 42P17 "infinite recursion detected in policy". Isso vale quando a política interna tem subconsulta, e as nossas sempre têm (`U` e `E` são subconsultas escalares) [doc: [RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html); comportamento do reescritor, **conferir** pelo T12 antes de escrever as demais políticas];
- consequência 1: **a política de uma tabela citada pela política de `obra`** (`membro_empresa`, `acesso_obra`, `carteira_obra`, `carteira`, `acesso_carteira`) **nunca cita `obra`**. Por isso `carteira_obra` filtra pela carteira, e não pela obra visível; e o alcance do gestor repete o caminho das carteiras em vez de consultar `obra`;
- consequência 2: **nenhuma política de `membro_empresa` cita `membro_empresa`**. A política de UPDATE "só administrador" do parecer (§2.2) cairia em 42P17 e por isso vira gatilho (§3.4). A política de SELECT fica como está: membro removido continua visível aos colegas da empresa (inofensivo; toda outra política filtra `removido_em IS NULL`);
- `frente` e `auditoria` podem citar `obra`, porque a política de `obra` não as cita.

**Q3 (quem atribui obra e frente):** o parecer **não traz recomendação explícita** na Q3. Decisão do arquiteto: o gestor de portfólio também atribui, porque a SPEC-02 §3 diz "Gestor de portfólio: … atribuir obras e frentes a engenheiros" [exigência da SPEC]. Por isso o banco cita `gestor_portfolio` pelo nome (parecer §2.2), e só no alcance dele. **Revisar no PR** (seção 15).

**INSERT de obra só para escopo `todas`** [doc: o `INSERT ... RETURNING` aplica a política de SELECT à linha nova; [CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html)]. A matriz limita "criar obra" ao administrador e responde 403 antes, para o 42501 nunca virar 500 (parecer §2.2).

**Custo:** subconsultas não correlacionadas (InitPlan ou hashed SubPlan) [doc: [EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)]. É estimativa, não medição: o T36 é informativo e registra `EXPLAIN (ANALYZE)` em tabela sintética de 6.000 linhas. Padrão para as tabelas filhas do 00015: `obra_id IN (SELECT id FROM cronoai.obra)`, nunca `EXISTS` correlacionado (parecer §2.4).

### 3.4 Gatilhos de `membro_empresa` (escalada e último administrador)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **`REVOKE INSERT ON membro_empresa FROM cronoai_app` + `DROP POLICY pol_membro_empresa_insert`** sem substituta | Política "convite válido" (parecer §3.3) já neste ciclo | **Achado bloqueante do gate.** Hoje `WITH CHECK (empresa_id = E)` deixa criar vínculo para **qualquer** `usuario_id`. Com perfis, isso é escalada de privilégio. Sem convite neste ciclo (00014c), nenhum caminho do app insere membro. São duas camadas: o privilégio (42501) e a ausência de política. O 00014c devolve o `GRANT INSERT` junto com a política do convite |
| **Gatilho `trg_membro_exige_administrador`** `BEFORE UPDATE ON membro_empresa FOR EACH ROW`, `ENABLE ALWAYS`. Recusa com `42501` se o usuário do contexto (`app.usuario_id`) não for administrador ativo da empresa da linha (`app.empresa_id = OLD.empresa_id`). Função `plpgsql`, `SET search_path = pg_catalog`, nomes qualificados, `CREATE FUNCTION` sem `OR REPLACE` | Política de UPDATE com `EXISTS` em `membro_empresa` (parecer §2.2) | A política consultaria a própria tabela: 42P17 (§3.3). Gatilho não é política: lê `membro_empresa` sob o RLS do chamador sem recursão. O efeito é o mesmo do parecer, e a política de UPDATE fica `empresa_id = E` [opinião, ajuste técnico ao parecer; **conferir** pelo T12 e T22]. Docs: [CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html) |
| **`GRANT UPDATE (perfil, escopo_obras, removido_em, atualizado_em)`**; `empresa_id`, `usuario_id` e `criado_em` imutáveis | `GRANT UPDATE` na tabela | [doc: [GRANT por coluna](https://www.postgresql.org/docs/current/sql-grant.html)]; parecer §1.1 |
| **Último administrador:** gatilho de restrição `trg_membro_garante_administrador` `AFTER INSERT OR UPDATE ... DEFERRABLE INITIALLY DEFERRED FOR EACH ROW`, `ENABLE ALWAYS`. Toma `pg_advisory_xact_lock(hashtextextended(NEW.empresa_id::text, 0))` e confere se existe administrador ativo. Recusa com `RAISE ... USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_empresa_tem_administrador'` | Conferir só na aplicação | Parecer §1.1. Sem o lock, dois rebaixamentos simultâneos passam em READ COMMITTED. É diferido para permitir "promover B e rebaixar A" na mesma transação. O nome da constraint permite mapear para 409 `ultimo-administrador` pelo padrão do `MapeadorErrosObra`. Docs: [CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html), [advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) |
| Ordem na migração: **backfill antes dos gatilhos** | Gatilhos antes | O backfill roda como migrador, sem contexto, e o gatilho de administrador o recusaria |

### 3.5 Matriz perfil × ação e aplicação nas rotas
**Matriz deste ciclo** (`MatrizPermissoes`, Domínio). **S** = permitido; **—** = 403 `acao-nao-permitida`. O alcance (quais obras) é sempre do RLS.

| Ação | administrador | eng. planejamento | eng. obra | suprimentos | encarregado | gestor portfólio | diretoria |
|---|---|---|---|---|---|---|---|
| `obras.ler` (listar, obter) | S | S | S | S | S | S | S |
| `obras.criar` | S | — | — | — | — | — | — |
| `obras.editar` (só `dataStatus` e `opcoesCronograma`) | S | S | — | — | — | — | — |
| `obras.editar_cadastro` (nome, UF, município, responsável, SINAPI) | S | — | — | — | — | — | — |
| `obras.arquivar` (arquivar e restaurar) | S | — | — | — | — | — | — |
| `trilha.ler` (trilha da obra) | S | S | S | — | — | S | — |
| `trilha.exportar` (CSV) | S | — | — | — | — | — | — |
| `membros.ler` | S | — | — | — | — | S | — |
| `membros.gerir` (perfil, remover, reativar, `incluirRemovidos`) | S | — | — | — | — | — | — |
| `acessos_obra.ler` | S | — | — | — | — | S | — |
| `acessos_obra.gerir` (conceder, revogar) | S | — | — | — | — | S | — |

Origem de cada célula (para revisão no PR):
- criar obra, gerir usuários: administrador (SPEC-02 §3);
- "tudo na obra": engenheiro de planejamento (SPEC-02 §3);
- engenheiro de obra "não altera linha de base" e trata apontamentos, restrições e insumos: não edita a obra;
- gestor de portfólio: "atribuir obras e frentes a engenheiros" e ver o portfólio (SPEC-02 §3);
- exportar a trilha só o administrador e nome/cadastro só quem vê todas (Q5, recomendação do parecer).

O resto é **[opinião, menor privilégio]**:
- suprimentos não lê a trilha: ela leva custos e motivos de obra;
- diretoria não lê a trilha: o papel dela é dashboards e relatórios, e a trilha traz o `motivo` em texto livre.

Tudo revisável no PR. As ações do 00014b (frentes, carteiras) entram na matriz lá.

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Uma política de autorização por ação** (`RequisitoPermissao(acao)` + `TratadorRequisitoPermissao`), sobre a política `EmpresaAtiva`. O tratador lê o perfil do `ContextoSessao` | Checagem dentro de cada handler | Fica declarada na rota, testável por enumeração (T42), e o 403 sai pelo `ResultadoAutorizacaoProblemDetails` com `type` `acao-nao-permitida` [doc: [policies](https://learn.microsoft.com/aspnet/core/security/authorization/policies)] |
| **Perfil e escopo carregados na consulta que já valida a sessão** (`ValidarSessaoAsync` devolve `Perfil`/`EscopoObras` do membro ativo da empresa ativa) | Consulta extra por requisição | Continua **uma** consulta por requisição (ADR 00005). A troca de perfil vale na próxima requisição (parecer §1.8) |
| **403 por perfil sai antes de carregar o recurso** | Carregar e depois decidir | O 403 é o mesmo para qualquer `{id}` (existente, alheio ou inexistente): não revela existência |
| **Obra sem vínculo → 404 idêntico ao de inexistente** | 403 (texto da SPEC-02) | **Decisão do gate** (seção 15): não revelar existência, como no ADR 00006. Com RLS por obra, a obra sem vínculo "não existe" para o usuário, e o caminho "carregar antes de atualizar" já devolve 404. A RFC 9110 admite 404 para ocultar o recurso [doc: [RFC 9110 §15.5.4](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4)]. **Diverge do critério da SPEC-02** ("recebe 403"). A divergência vai ao usuário; a SPEC-02 ganha nota, sem reescrever o critério (E4) |
| **Cadastro só para o administrador (Q5, Q7):** no `PUT /obras/{id}`, quem tem `obras.editar` sem `obras.editar_cadastro` e envia nome, UF, município, responsável ou SINAPI **diferente do atual** (comparado depois de normalizar) recebe 403 `campo-nao-permitido`, com a extensão `campos` (só os nomes). Ordem: 404 → 409 de versão → 409 de arquivada → 403 de campo | Remover a unicidade do nome; 409 genérico | **Q5 e Q7, recomendação do parecer §2.5 (opção 1).** Quem renomeia já vê todas as obras, então o 409 `obra-nome-duplicado` não revela nada novo. A unicidade continua |
| Responsável da obra (criar e editar) precisa ser **membro ativo** → 400 `responsavelId` (mesmo corpo para removido, alheio e inexistente) | Só a FK | A FK aceita membro removido; o mesmo 400 não revela existência (00013 Q4) |
| **Exportação só para o administrador** (Q5). Ela inclui as linhas de `obra_id` nulo (trilha da empresa) | Gestor também | Q5, recomendação do parecer |
| `motivo` visível a quem lê a trilha | Omitir para não autor | Q5, recomendação do parecer (é o propósito da trilha). A alternativa de minimização fica registrada (seção 13, Jurídico) |
| `GET /api/v1/eu` devolve `perfil` e `escopoObras` da empresa ativa (nulos sem empresa ativa) | Rota nova | O front (00019) esconde botões pela matriz. Ocultar não substitui a checagem (RF-02.2) |

### 3.6 Trilha: entidades novas e interceptor (parecer §1.7)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `MembroEmpresa`, `AcessoObra`, `Frente`, `AcessoFrente`, `Carteira`, `CarteiraObra`, `AcessoCarteira` viram `IAuditavel`. Exceções declaradas: só `Sessao` e `Empresa` | Manter `MembroEmpresa` como exceção | ADR 00006 e 00009 previam esvaziar a lista |
| `IAuditavel.Id` vira **`EntidadeId`**. `Obra` e as entidades com `id` implementam com `Id`; `MembroEmpresa` implementa com `UsuarioId` (único dentro da empresa da linha de trilha) | `id` substituto em `membro_empresa` | Parecer §1.7: o substituto mexeria nas FKs de `sessao` e `obra` |
| **`IDadoDeObra { Guid ObraId }`** em `AcessoObra`, `Frente` e `AcessoFrente`; `Obra` grava o próprio `Id`. As demais gravam `obra_id` nulo (trilha da empresa) | Manter o `if Obra` no interceptor | Parecer §1.7. A política de leitura da trilha usa esse `obra_id` |
| **`IVinculoRemovivel`** (`AcessoObra`, `AcessoFrente`, `CarteiraObra`, `AcessoCarteira`): `Deleted` grava `acao = 'remover'`, com `antes` = lista branca e `depois` nulo. As demais entidades continuam **lançando** em `Deleted` | Soft-delete nos vínculos | Parecer §1.2: `revogado_em` complicaria a unicidade, a política e o "conceder de novo" |
| **`IArquivavel`** (`Obra`, `Frente`, `Carteira`) e **`IRemovivelLogicamente`** (`MembroEmpresa`): a ação derivada generaliza o `if Obra` atual. Arquivar → `arquivar`/`restaurar`. `removido_em` de nulo para valor → `remover`; de valor para nulo → `restaurar` (reativar) | Ação nova `reativar` | Menos valores no CHECK [opinião] |
| `ck_auditoria_acao` ampliado com `remover` (`DROP CONSTRAINT` + `ADD CONSTRAINT` na migração). `aceitar` fica para o 00014c | Ampliar tudo agora | Só o que este ciclo grava |
| **Lista branca:** membro → `perfil`, `escopo_obras`, `removido_em`; `acesso_obra` → `obra_id`, `usuario_id`; frente → `nome`, `responsavel_id`, `arquivada_em`; `acesso_frente` → `obra_id`, `frente_id`, `usuario_id`; carteira → `nome`, `tipo`, `arquivada_em`; `carteira_obra` → `carteira_id`, `obra_id`; `acesso_carteira` → `carteira_id`, `usuario_id`. **`responsavel_texto` fica FORA** | Incluir `responsavel_texto` | É nome de pessoa por desenho (Q2) e a trilha é append-only (não se apaga). A troca só desse campo gera linha `alterar` com `antes`/`depois` vazios: registra quem e quando, sem o valor [opinião, privacidade por padrão]. Nomes de frente e de carteira podem conter nome de pessoa: nota ao Jurídico (seção 13) |
| Revogar acesso de obra **apaga antes os `acesso_frente` do usuário naquela obra**, no mesmo `SalvarAuditadoAsync` (uma trilha `remover` por linha). A FK `Restrict` impede esquecer | 409 pedindo para revogar as frentes antes | Parecer §1.3 |

### 3.7 API nova: membros e acessos de obra
| Rota | Política (ação) | Antiforgery | Cenário de isolamento | Respostas (`Results<…>` exato) |
|---|---|---|---|---|
| `GET /api/v1/membros?incluirRemovidos=` | `membros.ler` (+ `membros.gerir` se `incluirRemovidos=true`) | — | `SemRecurso` | 200, 401, 403 |
| `PUT /api/v1/membros/{usuarioId}` | `membros.gerir` | sim | `ComIdDeOutraEmpresa` (`Membro`) | 200, 400, 401, 403, 404, 409, 413 |
| `POST /api/v1/membros/{usuarioId}/remover` | `membros.gerir` | sim | idem | 200, 400, 401, 403, 404, 409, 413 |
| `POST /api/v1/membros/{usuarioId}/reativar` | `membros.gerir` | sim | idem | 200, 400, 401, 403, 404, 409, 413 |
| `GET /api/v1/obras/{id}/acessos` | `acessos_obra.ler` | — | `ComIdDeOutraEmpresa` (`Obra`) + obra sem vínculo (gestor com escopo `carteiras` sem a obra) | 200, 401, 403, 404 |
| `POST /api/v1/obras/{id}/acessos` | `acessos_obra.gerir` | sim | idem (corpo com membro **real** de A) | 201 + `Location`, 400, 401, 403, 404, 409, 413 |
| `POST /api/v1/obras/{id}/acessos/{usuarioId}/revogar` | `acessos_obra.gerir` | sim | `ComIdDeOutraEmpresa` (`ObraEMembro`) + obra sem vínculo | 204, 400, 401, 403, 404, 413 |

- **Contratos** (um tipo por arquivo):
  - `MembroResposta { usuarioId, nomeExibicao, perfil, escopoObras, removidoEm, versao }`, **sem** `emissor`/`sujeito`;
  - `AlterarMembroRequisicao { perfil, escopoObras, versao, motivo? }`;
  - `MudancaMembroRequisicao { versao, motivo? }`;
  - `AcessoObraResposta { usuarioId, criadoEm }`;
  - `ConcederAcessoRequisicao { usuarioId, motivo? }`;
  - `RevogarAcessoRequisicao { motivo? }`.
- **Escopo derivado:** perfis com um único escopo válido recebem o escopo do servidor. Gestor e diretoria exigem `escopoObras` (`todas` ou `carteiras`). Par inválido → 400. `perfil = encarregado` → 400 `perfil-indisponivel` (Q2).
- **409** em ProblemDetails, com `type` curto:
  - `conflito-de-versao` (com `estadoAtual`);
  - `ultimo-administrador` (constraint `ck_empresa_tem_administrador`, no `COMMIT`);
  - `membro-responsavel` (remover quem é responsável de obra; extensão `obras` só com ids);
  - `membro-removido` / `membro-nao-removido`;
  - `acesso-existente` (23505 em `ux_acesso_obra_obra_usuario`).
- **Destino inválido ao conceder acesso** (membro de outra empresa, inexistente, removido, ou com escopo diferente de `vinculadas`) → **o mesmo 400** na chave `usuarioId` (corpos iguais exceto `traceId`). Não revela existência (padrão 00013 T48).
- **Revogar:** `POST .../revogar` com corpo `{ motivo? }`, e não `DELETE` com corpo, porque a semântica de corpo em `DELETE` é indefinida [doc: [RFC 9110 §9.3.5](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.5)]; mesmo padrão do arquivar do 00013. Vínculo inexistente → 404.
- **Versão nos vínculos:** o vínculo não tem versão (só se insere ou apaga). A duplicata dá 409 e o ausente dá 404. Decisão registrada contra o RF-01.4 [opinião: não há atualização para perder].
- **Nomes na listagem** saem de `ConsultasIdentidade.ListarMembrosAsync(empresaId)` (único arquivo com acesso a `DbSet<Usuario>`), com filtro explícito por membro **da empresa ativa**. `usuario` segue sem RLS até o 00014c; o risco residual do ADR 00006 continua registrado.
- **Limite de corpo** de 8 KB nas escritas novas (`LimiteDeCorpoMetadata`) → 413 [opinião].
- **Limite de taxa:** nenhum novo neste recorte (rotas de administrador, volume baixo) [opinião]. Lição 7: qualquer limite em rota autenticada é **por usuário**, no padrão do `LimitadorDeExportacao`. O convite e o aceite do 00014c vão precisar disso.
- **Atribuição em massa:** o corpo não leva `empresaId`. O `usuarioId` do corpo de conceder é o alvo legítimo, conferido como membro ativo de E [doc: [OWASP Mass Assignment](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html)].
- **TypedResults (lição 3):** cada handler declara em `Results<…>` só os resultados que alcança. 401, 403 e 413 do pipeline vão em `.ProducesProblem(...)`. Braço impossível → `UnreachableException` (padrão do POST de obra). Nada declarado que não seja alcançável: o `arquiteto` confere contra esta tabela, e o OpenAPI regenerado é o contrato. Regiões do ADR 00004 em todo tipo novo [doc: [respostas em minimal APIs](https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis/responses)].

### 3.8 Primeiro administrador: semente de desenvolvimento e Q8
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Produção:** nenhum caminho cria empresa nem primeiro administrador (como hoje). O comando administrativo com credencial dedicada fica **pendente da Infraestrutura e do produto** | Política "empresa vazia pode se auto-reivindicar" | **Q8, recomendação do parecer §6.2:** comando explícito, fora da API, com credencial definida com a Infraestrutura, e **nunca** auto-reivindicação. A credencial não está definida, então o comando de produção não cabe sem inchar. O ADR 00005 (G2) já dizia que a empresa só existe pela semente |
| **Desenvolvimento:** `ProvisionamentoEmpresa` (`Dados/Rls/`). Recebe uma fábrica com a **string do migrador** e, numa transação: `NO FORCE` em `membro_empresa` → `INSERT` da empresa e dos membros (com perfil e escopo) → `SET CONSTRAINTS ck/trg_membro_garante_administrador IMMEDIATE` → `FORCE`. Só a `SementeDesenvolvimento` o chama, e ela recusa fora de `Development`. A string do migrador é lida só dentro do comando `semear-desenvolvimento` | Superusuário na semente; deixar a semente sem membros | Reusa o padrão aprovado do `ExecutarDmlComRls` (ADR 00006) e é a primitiva da Q8 [opinião]. O `SET CONSTRAINTS ... IMMEDIATE` é necessário: o gatilho diferido rodaria no `COMMIT`, já com `FORCE`, e o migrador veria zero linhas [doc: [SET CONSTRAINTS](https://www.postgresql.org/docs/current/sql-set-constraints.html)]. O DDL é transacional: falha no meio desfaz o `NO FORCE` |
| O provisionamento **não grava trilha** (dado fictício de desenvolvimento) | Gravar trilha como migrador | Gravar exigiria `NO FORCE` na `auditoria` e mexeria numa garantia do append-only (R19). Exceção declarada, como `CriarObraSemAuditoriaAsync` nos testes. A R18 ganha uma lista permitida de **um** arquivo |
| A semente cria, por empresa fictícia: `dev-a` administrador; na empresa compartilhada, `dev-b` como `engenheiro_obra` vinculado a **uma** obra fictícia. A obra é criada pelo serviço de obras, auditada, com o contexto do administrador | Perfis todos iguais | Parecer §4.2: perfis diferentes para a demonstração e a subida local (V-2) |
| Testes: `DadosTeste` cria membros pelo **superusuário da fixture** (só para produzir estado), sempre com um administrador por empresa (o gatilho diferido exige) | Testes pelo provisionamento | Parecer §3.2(a). Mais rápido e sem DDL por teste. O provisionamento tem testes próprios (T35, X8) |

## 04. Caso de referência (T1/T2)
Não se aplica — sem cálculo.

## 05. MS Project e arquivos (T3)
Não se aplica — nenhum formato novo. O CSV da trilha não muda de formato, só de autorização.

## 06. Estado salvo (T4)
Não se aplica — `src/` não muda.

## 07. Dados (T8 com banco)
Parecer do `dba`: **`00014-tarefa0-dba.md`, `VEREDITO: AJUSTAR`**. Recomendações adotadas e ajustes técnicos na seção 16. **Migração nova `PerfisPermissoes`** (lição 9: a `ObrasAuditoria` já está na branch remota e não é editada; o `git diff` dela no PR tem de ser vazio).

### 07.1 Tabelas (parecer §1, sem `convite_membro`)
| Tabela | Colunas | Chaves e restrições |
|---|---|---|
| `membro_empresa` (alterada) | + `perfil text NOT NULL`, `escopo_obras text NOT NULL`, `removido_em timestamptz NULL`, `atualizado_em timestamptz NOT NULL` | `ck_membro_perfil` (7 valores), `ck_membro_escopo` (3 valores), `ck_membro_perfil_escopo` (par do parecer §1.1), `ck_membro_removido_apos_criado`, `ck_membro_atualizado_apos_criado` |
| `acesso_obra` | `id uuid` (v7), `empresa_id`, `obra_id`, `usuario_id`, `criado_em` | PK; `fk_acesso_obra_obra (empresa_id, obra_id)`; `fk_acesso_obra_membro (empresa_id, usuario_id)`; `ux_acesso_obra_obra_usuario (obra_id, usuario_id)` |
| `frente` | `id`, `empresa_id`, `obra_id`, `nome text` (1 a 200), `responsavel_id uuid NULL`, **`responsavel_texto text NULL`** (até 120, sem caractere de controle; Q2), `versao bigint DEFAULT 1`, `criada_em`, `atualizada_em`, `arquivada_em` | PK; FK `(empresa_id, obra_id)` → obra; FK `(empresa_id, responsavel_id)` → membro, `MATCH SIMPLE`; `ux_frente_empresa_obra_id (empresa_id, obra_id, id)`; índice único parcial `ux_frente_obra_nome_ativa (obra_id, lower(nome)) WHERE arquivada_em IS NULL` (SQL cru); `ck_frente_responsavel_um_so` (no máximo um entre `responsavel_id` e `responsavel_texto`) [opinião]; CHECKs de ordem e de versão positiva |
| `acesso_frente` | `id`, `empresa_id`, `obra_id`, `frente_id`, `usuario_id`, `criado_em` | FK `(empresa_id, obra_id, frente_id)` → frente; FK `(obra_id, usuario_id)` → `acesso_obra (obra_id, usuario_id)`; `ux_acesso_frente_frente_usuario (frente_id, usuario_id)` |
| `carteira` | `id`, `empresa_id`, `nome` (1 a 200), `tipo` (`regional`, `cliente`, `gestor`), `versao`, `criada_em`, `atualizada_em`, `arquivada_em` | `ux_carteira_empresa_id_id`; índice único parcial `(empresa_id, tipo, lower(nome)) WHERE arquivada_em IS NULL` |
| `carteira_obra` | `id`, `empresa_id`, `carteira_id`, `obra_id`, `criado_em` | FKs compostas para carteira e obra; `ux_carteira_obra_carteira_obra (carteira_id, obra_id)`. **N:N** (Q4) |
| `acesso_carteira` | `id`, `empresa_id`, `carteira_id`, `usuario_id`, `criado_em` | FKs compostas para carteira e membro; `ux_acesso_carteira_carteira_usuario` |

- Todas as FKs são `Restrict` (ADR 00004), e os nomes cabem em 63 bytes (`Identificadores_cabem_em_63_bytes`).
- **Q4 (recomendação do parecer):** obra em várias carteiras (N:N), e carteira arquivada **não** concede acesso (o predicado filtra `c.arquivada_em IS NULL`).
- **Função genérica** `cronoai.incrementa_versao()` para `frente` e `carteira`, sem tocar a da obra (parecer §1.3).

### 07.2 Privilégios, políticas e gatilhos
- **Privilégios** (o `Inicial` concede DML geral):
  - `membro_empresa`: `REVOKE INSERT`; `GRANT UPDATE (perfil, escopo_obras, removido_em, atualizado_em)`; `DELETE` segue revogado;
  - `frente`, `carteira`: `REVOKE DELETE`;
  - `acesso_obra`, `acesso_frente`, `carteira_obra`, `acesso_carteira`: **`REVOKE UPDATE`** (vínculo é imutável: só se insere ou apaga) [opinião, menor privilégio; o parecer não cobria];
  - nenhuma tabela com `TRUNCATE`, `TRIGGER` ou `REFERENCES`.
- **RLS:** `ENABLE` + `FORCE` nas 6 tabelas novas e as políticas do §3.3, pelo helper.
  - Substituídas por `SubstituirPolitica*` (`DROP POLICY` + `CREATE POLICY` na mesma migração): `pol_empresa_select`, `pol_obra_select/insert/update`, `pol_auditoria_select/insert`.
  - Removida: `pol_membro_empresa_insert`. Nova: `pol_membro_empresa_update`.
- **Gatilhos:**
  - `trg_membro_exige_administrador` e `trg_membro_garante_administrador`, os dois com `ENABLE ALWAYS`;
  - `trg_frente_versao` e `trg_carteira_versao`, no padrão do `trg_obra_versao`.
- **R19 vai alertar de propósito** (substituição das políticas da `auditoria`). O PR registra: "R19 alertou, conferido: três camadas intactas (T27)" (parecer §4.4).
- **Guarda no helper:** `PoliticaUpdate` e `PoliticaDelete` lançam `ArgumentException` com `tabela == "auditoria"`. `SubstituirPolitica` na `auditoria` só aceita SELECT e INSERT (parecer §4.4) (T37).

### 07.3 Migração `PerfisPermissoes` (Up, uma transação; parecer §4.1, com a ordem ajustada)
1. `ADD COLUMN` das 4 colunas, todas nulas.
2. **Backfill Q10** por `ExecutarDmlComRls("membro_empresa", "UPDATE cronoai.membro_empresa SET perfil = 'administrador', escopo_obras = 'todas', atualizado_em = criado_em WHERE perfil IS NULL")`, com a chamada e o SQL na mesma linha (R15).
3. `SET NOT NULL` e CHECKs. Com dado real, `NOT VALID` + `VALIDATE` separado reduz o lock; o momento é da Infraestrutura.
4. `CREATE TABLE` das 6 tabelas; índices (§07.4); índices únicos parciais por `migrationBuilder.Sql`.
5. Funções e gatilhos de versão e de membro (**depois** do backfill).
6. Privilégios (§07.2).
7. RLS: `ENABLE`/`FORCE` e políticas, por helper; substituições.
8. `ck_auditoria_acao` com `remover`.
9. Conferência final num bloco `DO` com `RAISE EXCEPTION`: nenhum membro sem perfil; `auditoria` com **exatamente** as políticas SELECT e INSERT; gatilhos com `tgenabled = 'A'`.

**Down** (parecer §4.5): reversão estrutural, com perda dos dados novos (aceitável sem produção; declarar no PR).
- Remove gatilhos, funções, tabelas (na ordem inversa das FKs) e colunas.
- Restaura `GRANT INSERT` e a `pol_membro_empresa_insert`.
- **Restaura literalmente** os predicados de `empresa`, `obra` e `auditoria` das migrações do 00012 e do 00013, e o `ck_auditoria_acao` antigo.
- O T34 exige `pg_policies` **idêntico** ao golden do 00013 depois do `Down`. Sem `CASCADE`.

### 07.4 Índices (app DB; parecer §1.6)
- Novos:
  - `ix_acesso_obra_usuario (usuario_id, obra_id)`;
  - `ix_acesso_obra_empresa_obra (empresa_id, obra_id)`;
  - `ix_acesso_frente_usuario (usuario_id, frente_id)`;
  - `ix_frente_empresa_obra (empresa_id, obra_id)`;
  - `ix_carteira_obra_obra (obra_id, carteira_id)`;
  - `ix_acesso_carteira_usuario (usuario_id, carteira_id)`.
- **Conferir** os índices de FK criados pela convenção do EF e remover os duplicados (T38).
- Sem GIN; nada mais antes de medir.
- **Índice parcial de `sessao` (pendência herdada): avaliado, mantido o completo** (parecer §4.3). Fecha no ADR 00006.

### 07.5 Consultas previstas
Todas pelo EF (LINQ):
- obras visíveis (o RLS filtra);
- membros da empresa com nome (`ConsultasIdentidade`);
- membro por `(empresa, usuário)` para alterar;
- obras de que um membro é responsável (para o 409);
- vínculos de uma obra;
- `acesso_frente` de um usuário numa obra (para revogar).

Nenhum SQL de escrita fora do `SaveChanges` auditado, salvo o provisionamento de desenvolvimento (§3.8).

## 08. Segurança
**Superfície nova:**
- 7 rotas autenticadas (5 de escrita) e 9 alteradas;
- autorização por perfil;
- RLS por obra;
- gatilhos com efeito de autorização;
- leitura de nomes de colegas;
- caminho de provisionamento com a credencial do migrador (só `Development`);
- campo `responsavel_texto` (nome de trabalhador).

| Ameaça | Mitigação | Teste |
|---|---|---|
| **Escalada: app cria vínculo para qualquer usuário** (achado bloqueante) | `REVOKE INSERT` + política removida | T24, T26 |
| Escalada: não administrador altera perfil (inclusive o próprio) | Matriz (403) + gatilho `trg_membro_exige_administrador` (42501) + `GRANT UPDATE` só por coluna | T22, T26, T50, T62 |
| Empresa sem administrador (concorrência) | Gatilho diferido + advisory lock | T23, T30, T62 |
| IDOR entre empresas e **entre obras da mesma empresa** | RLS por obra; carregar antes de atualizar; 404 idêntico; recurso real no catálogo; cenário sem vínculo | T13 a T16, T51, T64, T75 a T77 |
| Oráculo de existência (409 de nome, 403 x 404, 400 de destino) | Cadastro só para quem vê tudo (Q5/Q7); 404 para sem vínculo; mesmo 400 para destino inválido; 403 de perfil antes de carregar | T53, T51, T66, T50 |
| Política afrouxada numa migração futura | Predicados exatos (golden) + controle por mutação | X9, T11, mutações dos T14 a T22 |
| Recursão de política (42P17) que derruba a leitura | Regras do §3.3; consulta de todas as tabelas sob todos os contextos | T12 |
| Removido mantém acesso | `removido_em IS NULL` em toda política e consulta; uma asserção por ponto | T25, T58 |
| Leitura da trilha alheia (motivo, custos) | `pol_auditoria_select` por visibilidade; trilha da empresa só administrador; matriz | T27, T55, T56 |
| Trilha atribuída a outro usuário | `pol_auditoria_insert` com `usuario_id = U` (fecha lacuna do 00013) | T27 |
| Dado pessoal na trilha e em log | Lista branca sem `responsavel_texto`; listagem sem `emissor`/`sujeito`; logs só com ids | T41, T61, T70 |
| Credencial do migrador fora do lugar | Lida só no comando de semente, só em `Development`; `FORCE` restaurado na mesma transação | T35, X8 |
| Erro com detalhe interno | Mapeamento por `SqlState` + nome da constraint; 42501 → 500 genérico | T62, T66 |

- **Dependências novas:** nenhuma (sem pacote, sem imagem). Advisory lock, `xmin` e gatilhos são do PostgreSQL e do Npgsql já em uso.
- **ASVS 5.0.0** (numeração dos itens a conferir na tag `v5.0.0`; nenhum número inventado):
  - **V2:** regras de negócio (último administrador, par perfil × escopo);
  - **V4:** ProblemDetails 400/403/404/409/413;
  - **V7:** a sessão do removido cai na próxima requisição;
  - **V8:** autorização por perfil e por obra, inclusive sem passar pela UI;
  - **V14:** minimização na listagem e na trilha;
  - **V16:** trilha de membros e vínculos, logs sem dado pessoal.
- **Validação da Segurança da Informação** (seção 13): gatilho como controle de autorização, uso do migrador na semente de desenvolvimento e o futuro comando da Q8. O convite por token e a exposição de `emissor` + `sujeito` ficam para o 00014c, **depois** do parecer dela.

## 09. Entregáveis e divisão do ciclo

### 9.1 Por que dividir
O PLANO estimou o 00014 em **M**. O escopo pedido inclui:
- 7 tabelas e 1 alteração;
- `usuario` sob RLS com variáveis de login;
- convite;
- cerca de 25 rotas novas (membros, convites, acessos de obra e de frente, frentes, carteiras, obras da carteira, acessos de carteira);
- a matriz nas rotas existentes.

É por volta de **3× o 00013**, que já estava "no limite de um M/G" com 8 rotas, 4 tabelas e 78 testes. O parecer também avisou (§6.1, risco 10). O template limita o ciclo a 4 entregáveis.

| Opção | Recorte | Avaliação |
|---|---|---|
| A | Um ciclo com tudo | **Descartada:** passa de 4 entregáveis e de G; uma reprovação devolve tudo |
| B | 00014 = tudo menos convite e `usuario` RLS; 00014b = convite e `usuario` RLS | **Descartada:** o 00014 ainda teria cerca de 2× o 00013 (G+) |
| **C — recomendada [opinião]** | **00014** (este plano): banco completo menos convite e `usuario` RLS; matriz; rotas existentes; membros; acessos de obra. **00014b:** API de frentes, acessos de frente, carteiras, obras da carteira e acessos de carteira, sobre o banco pronto (sem migração prevista). **00014c:** convite, `usuario` sob RLS, variáveis de login e de convite, limite por usuário no convite e no aceite | Cada um fica em M/G ou menos. O 00014c espera o parecer da Segurança (Q6), que é pendência de área de qualquer jeito. Uma migração só para o modelo de permissão: o golden dos predicados se escreve uma vez |
| D | 00014 sem as tabelas de frente e carteira; 00014b com banco e API delas | **Descartada:** substitui as políticas de `obra` duas vezes (dois goldens, dois `Down`); o escopo `carteiras` nasceria sem predicado |

**Recomendação: Opção C.** O PLANO-FASE-2 §5.4 ganha as linhas do 00014b e do 00014c (E4), com branches empilhadas: `feat/00014b-frentes-carteiras` sobre esta e `feat/00014c-convite-usuario-rls` sobre a 00014b. Cada um tem plano próprio, com revisão do `dba` antes. O esboço dos critérios está no §9.3.

### 9.2 Entregáveis deste ciclo (00014)
Commits em Conventional Commits, em português, terminando com a linha exata `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, só com aprovação do usuário.

| # | Entregável | Fronteira | Critérios | Commit |
|---|---|---|---|---|
| E1 | Domínio e banco: constantes e `MatrizPermissoes`; 7 entidades; configurações; interceptor estendido; lista branca; helpers de RLS e guarda; migração `PerfisPermissoes`; `ProvisionamentoEmpresa`; `DadosTeste`; testes de domínio, banco e arquitetura | `server/src/CronoAI.Dominio/**`, `server/src/CronoAI.Dados/**`, `server/tests/.../{Dominio,Dados}/**`, `ArquiteturaTestes.cs`, `MigracoesTestes.cs`, `Infra/DadosTeste.cs` | AC-2 a AC-8, AC-17 (banco), R-1, R-2 | `feat(server): perfis, escopo de obras e RLS por obra no banco (ciclo 00014, E1)` |
| E2 | Sessão e autorização: perfil na validação da sessão; `RequisitoPermissao`; matriz nas 8 rotas existentes; cadastro só administrador; responsável ativo; `/eu`; semente; catálogo com obra sem vínculo; teste perfil × rota | `server/src/CronoAI.Api/{Sessao,Obras,Auditoria,Autenticacao,Desenvolvimento,Empresas}/**`, `ConsultasIdentidade.cs`, `SessaoValidada.cs`, `Program.cs`, `server/openapi/CronoAI.Api.json`, `server/tests/.../{Obras,Auditoria,Autenticacao,Isolamento,Sessao}/**` | AC-9 a AC-12, AC-15 (parte), AC-17 | `feat(server): matriz perfil x ação nas rotas e 404 para obra sem vínculo (ciclo 00014, E2)` |
| E3 | Membros e acessos de obra: 7 rotas, serviços, contratos, mapeamento, catálogo, testes | `server/src/CronoAI.Api/{Membros,Acessos}/**`, `ConsultasIdentidade.cs`, `Program.cs`, `server/openapi/CronoAI.Api.json`, `server/tests/.../{Membros,Acessos,Isolamento}/**` | AC-13, AC-14, AC-15, AC-16, AC-21 | `feat(server): gestão de membros e acessos de obra com trilha (ciclo 00014, E3)` |
| E4 | Regras e documentação: R18 e R19; ADR 00010; ADRs 00004, 00006 e 00009; `backend-dotnet.md`; checklist ASVS; SPEC-01, SPEC-02 e SPEC-14 (notas); PLANO-FASE-2 §5.4; `CLAUDE.md`; `server/README.md` | `.claude/scripts/lib/regras-cronoai*.mjs`, `.claude/adrs/**`, `.claude/rules/backend-dotnet.md`, `.claude/checklists/seguranca.md`, `docs/specs/{SPEC-01,SPEC-02,SPEC-14,PLANO-FASE-2}*.md`, `CLAUDE.md`, `server/README.md` | AC-18, AC-19 | `docs(processo): ADR de perfis e permissão por obra, regras R18 e R19 ampliadas (ciclo 00014, E4)` |

- Cerca de 80 arquivos, dos quais ~4 gerados (migração, designer, snapshot, OpenAPI).
- Cada entregável passa sozinho em `dotnet build -c Release`, `dotnet test`, `npm run lint` e `npm run ci`.
- Dependências: E2 depende do E1; E3 depende do E2 (autorização e catálogo); E4 corre em paralelo depois do E1.
- **Linha de corte:** se o checkpoint depois do E2 passar de 1,5× o previsto (medido em tarefas concluídas contra o grafo do §10, porque o 00013 não tinha linha de base de tempo; desvio 17 dele), o **E3 vai para o 00014b**, com os mesmos AC-13 e AC-14.

### 9.3 Esboço dos próximos (para o gate da divisão; cada um terá plano próprio)
- **00014b — Frentes e carteiras (API).** Rotas:
  - `GET`/`POST /obras/{id}/frentes`;
  - `PUT /frentes/{id}` com `versao`;
  - `POST /frentes/{id}/arquivar|restaurar`;
  - acessos de frente (listar, conceder, revogar);
  - `GET`/`POST /carteiras`, `PUT` com versão, arquivar/restaurar;
  - obras da carteira (incluir, retirar);
  - acessos de carteira.

  Matriz ganha `frentes.ler`, `frentes.gerir` (administrador, engenheiro de planejamento), `acessos_frente.gerir` (administrador, gestor no alcance), `carteiras.ler` (administrador, gestor, diretoria) e `carteiras.gerir` (administrador). Esboço de critérios: CRUD com 409 de versão e de nome; trilha; isolamento com frente e carteira **reais** de B e frente de obra sem vínculo; escopo `carteiras` enxergando as obras pela API; `responsavel_texto` fora da trilha e dos logs. Sem migração prevista; se precisar, migração nova.
- **00014c — Convite e `usuario` sob RLS** (depois do parecer da Segurança sobre a Q6). Entram:
  - `convite_membro` (token CSPRNG de 256 bits, só o hash no banco, expiração, mensagem única, consumo concorrente);
  - variáveis `app.login_emissor`, `app.login_sujeito` e `app.convite_hash` no interceptor, sempre sobrescritas;
  - `usuario` com `ENABLE`/`FORCE` e as 3 políticas do parecer §3.2;
  - `GRANT INSERT` em `membro_empresa` com a política do convite;
  - `aceitar` no `ck_auditoria_acao`;
  - limite de taxa **por usuário** no convite e no aceite.

  Esboço de critérios: T11 e T12 do parecer, pool estendido com as 5 variáveis, aceite atômico, perfil `encarregado` só se RH e Jurídico tiverem liberado.

## 10. Tarefas
Cada tarefa leva até ~20 minutos de agente, salvo a migração.

| # | E | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 0 | — | **Feita:** levantamento do modelo (`00014-tarefa0-dba.md`) | dba | — | — |
| 1 | E1 | Domínio, parte 1:<br>• constantes `Perfis`, `EscoposObras`, `TiposCarteira`, `AcoesPermissao`;<br>• `MatrizPermissoes` (tabela do §3.5; sem padrão implícito: ação ou perfil ausente lança);<br>• `IAuditavel.EntidadeId`, `IDadoDeObra`, `IVinculoRemovivel`, `IArquivavel`, `IRemovivelLogicamente`;<br>• `Obra` ajustada às interfaces | dev-backend | `server/src/CronoAI.Dominio/*.cs` | gate |
| 2 | E1 | Domínio, parte 2:<br>• `MembroEmpresa` (`Criar` com perfil e escopo; `AlterarPerfil`, `Remover`, `Reativar`; validação do par);<br>• `AcessoObra`, `Frente` (`Criar`; `responsavel_texto` até 120, sem controle; exclusividade com `responsavel_id`);<br>• `AcessoFrente`, `Carteira` (`Criar`), `CarteiraObra`, `AcessoCarteira` | dev-backend | idem | 1 |
| 3 | E1 | Configurações EF:<br>• CHECKs nomeados; FKs compostas na ordem da chave alvo; chaves alternativas;<br>• `xmin` como `Versao` em `MembroEmpresa` (`IsRowVersion`);<br>• `versao` gerada em `frente`/`carteira`;<br>• `PropertySaveBehavior.Throw` nos imutáveis;<br>• índices do §07.4.<br>`DbSet`s | dev-backend | `Configuracoes/*.cs`, `CronoDbContext.cs` | 2 |
| 4 | E1 | `AuditoriaInterceptor` (§3.6: `EntidadeId`, `obra_id` por interface, `remover` para vínculo, ação por `IArquivavel`/`IRemovivelLogicamente`) e `ListaBrancaAuditoria` (7 entradas, sem `responsavel_texto`) | dev-backend | `Auditoria/*.cs` | 3 |
| 5 | E1 | `Rls/ExpressoesPermissao.cs` (fragmentos do §3.3); `SubstituirPoliticaSelect/Insert/Update/Delete`; guarda da `auditoria` em `PoliticaUpdate`/`PoliticaDelete` e na substituição | dev-backend | `Rls/*.cs` | 1 |
| 6 | E1 | `dotnet ef migrations add PerfisPermissoes`. À mão, na ordem do §07.3: backfill, gatilhos (`CREATE FUNCTION` sem `OR REPLACE`; `ENABLE ALWAYS` nos de membro), índices parciais, privilégios, RLS, substituições, CHECK da trilha, bloco `DO`, `Down()` com os predicados literais. `has-pending-model-changes` limpo | dev-backend | `Migrations/*_PerfisPermissoes*.cs`, snapshot | 4, 5 |
| — | E1 | **Checkpoint 1:** o orquestrador confere a migração contra o §07 e roda **primeiro o T12** (recursão) e o T22 (gatilho), que validam o ajuste técnico do §3.4 antes do resto | orquestrador | — | 6 |
| 7 | E1 | `ProvisionamentoEmpresa` (§3.8) e `DadosTeste` (superusuário, perfil e escopo, um administrador por empresa; `CriarAcessoObraAsync`, `CriarCarteiraComObraAsync`, `CriarFrenteAsync`) | dev-backend | `Rls/ProvisionamentoEmpresa.cs`, `Infra/DadosTeste.cs` | 6 |
| 8 | E1 | Testes de domínio T01 a T07 e T37 | dev-backend | `server/tests/.../Dominio/*.cs`, `Dados/RlsHelperTestes.cs` | 2, 5 |
| 9 | E1 | Testes de banco, visibilidade: T11 a T19, X2, X3, X6, X9 (golden **copiado da saída real**) | dev-backend | `Dados/{RlsPermissaoTestes,CatalogoTestes,RlsTestes}.cs` | 7 |
| 10 | E1 | Testes de banco, membro e trilha: T20 a T36, T38, X1, X4 | dev-backend | `Dados/{MembroTestes,VinculosTestes,AuditoriaPermissaoTestes,AtomicidadeTestes,ProvisionamentoTestes,DesempenhoRlsTestes}.cs`, `MigracoesTestes.cs`, `PrivilegiosIdentidadeTestes.cs` | 7 |
| 11 | E1 | Testes de arquitetura T41 a T43, X10 | dev-backend | `ArquiteturaTestes.cs` | 4 |
| 12 | E2 | Sessão: `ValidarSessaoAsync` (perfil/escopo/`removido_em`, uma consulta); `MinhasEmpresasAsync`; `DefinirEmpresaAtivaAsync` (só membro ativo → 404); `SessaoValidada`; `ContextoSessao` (`Perfil`, `EscopoObras`); `EuResposta` | dev-backend | `Identidade/*.cs`, `Sessao/ContextoSessao.cs`, `Sessao/ValidadorSessao.cs`, `Autenticacao/Eu*.cs` | E1 |
| 13 | E2 | `RequisitoPermissao`, `TratadorRequisitoPermissao`, `PoliticasPermissao` (uma política por ação, sobre `EmpresaAtiva`); 403 `acao-nao-permitida` em `ResultadoAutorizacaoProblemDetails` | dev-backend | `Sessao/*.cs`, `Program.cs` | 12 |
| 14 | E2 | Obras e trilha: política por rota (§3.5); `ServicoObras` com `campo-nao-permitido` e responsável ativo; exportação com `trilha.exportar`; OpenAPI regerado | dev-backend | `Obras/*.cs`, `Auditoria/AuditoriaEndpoints.cs`, `server/openapi/CronoAI.Api.json` | 13 |
| 15 | E2 | `SementeDesenvolvimento` pelo provisionamento (§3.8); X8 | dev-backend | `Desenvolvimento/SementeDesenvolvimento.cs`, `Autenticacao/SementeDesenvolvimentoTestes.cs` | 7, 14 |
| 16 | E2 | Catálogo: `RecursoAlheio.Membro` e `ObraEMembro`; `Concretizar(padrao, recursos)` para `{id}` e `{usuarioId}`; cenário de obra sem vínculo por rota (usuário com a ação e sem alcance; `NaoSeAplica` justificado quando só perfis `todas` têm a ação); montador único; T76, T77; X5 | dev-backend | `Isolamento/*.cs` | 14 |
| 17 | E2 | Testes de API T50 a T60 | dev-backend | `server/tests/.../{Sessao,Obras,Auditoria}/*Testes.cs` | 14 |
| 18 | E3 | Contratos e `MapeadorErrosMembros` (`ck_empresa_tem_administrador` → 409; `ux_acesso_obra_obra_usuario` → 409; `fk_acesso_obra_membro` → 400 `usuarioId`; não mapeada → 500) | dev-backend | `Membros/*.cs`, `Acessos/*.cs` | E2 |
| 19 | E3 | `ServicoMembros` + `MembrosEndpoints` (4 rotas); `ConsultasIdentidade.ListarMembrosAsync` | dev-backend | `Membros/*.cs`, `Identidade/ConsultasIdentidade.cs`, `Program.cs` | 18 |
| 20 | E3 | `ServicoAcessosObra` + `AcessosObraEndpoints` (3 rotas; revogar apaga `acesso_frente` no mesmo salvamento); entradas do catálogo; OpenAPI | dev-backend | `Acessos/*.cs`, `Program.cs`, `CatalogoRotas.cs`, `server/openapi/CronoAI.Api.json` | 18 |
| 21 | E3 | Testes T61 a T71 | dev-backend | `server/tests/.../{Membros,Acessos}/*Testes.cs` | 19, 20 |
| 22 | E4 | **R18** (lista de tabelas: `obra`, `auditoria`, `membro_empresa`, `acesso_obra`, `frente`, `acesso_frente`, `carteira`, `carteira_obra`, `acesso_carteira`; lista permitida: `Rls/ProvisionamentoEmpresa.cs`) e **R19** (helper `Politica*`/`SubstituirPolitica*` com `"auditoria"`), com casos (T78, T79) | dev-backend | `.claude/scripts/lib/regras-cronoai.mjs`, `regras-cronoai.test.mjs` | E1 |
| 23 | E4 | **ADR 00010** "Perfis e permissão por obra: visibilidade no banco, ação na aplicação" (`Proposto`): §3.3 a §3.5, regras de recursão, limite honesto, padrão para as tabelas filhas (00015) e para a coluna de restrição por frente (00018, parecer §2.4), Q8. Número: o próximo livre (00007/00008 reservados; **conferir** no `/adr`) | orquestrador (`/adr`), revisão do arquiteto | `.claude/adrs/00010-*.md`, `README.md` | gate |
| 24 | E4 | Documentação:<br>• **ADR 00006:** tabela de políticas, `usuario` RLS adiado ao 00014c, índice de `sessao` "avaliado, mantido", notas do 00014 cumpridas;<br>• **ADR 00009:** `remover`, `EntidadeId`, `IDadoDeObra`, exceções;<br>• **ADR 00004:** `xmin` aplicado em membro, exceção do provisionamento de desenvolvimento;<br>• `backend-dotnet.md`; checklist (V2, V4, V7, V8, V14, V16);<br>• **SPEC-02:** nota no critério "403" (404 por decisão do gate, divergência com o usuário) e no RF-02.3a (vínculo sem filtro de dado);<br>• **SPEC-01 §5** (tabelas novas); **SPEC-14 RF-14.8** (modelo no 00014, API no 00014b);<br>• **PLANO-FASE-2 §5.4** (divisão);<br>• `CLAUDE.md`; `server/README.md` (semente com a string do migrador) | dev-backend | arquivos do E4 | 23 |
| 25 | — | Evidências **no HEAD** (lição 8):<br>• `dotnet restore --locked-mode`, build Release, `dotnet test`, format, has-pending, vulneráveis;<br>• `node --test`; `validar-regras` e `classificar-diff` com `--base feat/00013-obras-auditoria`;<br>• **`npm run lint`** e `npm run ci`;<br>• `git diff --name-only` (front intacto; `ObrasAuditoria` sem diff);<br>• subida local com curl (V-2) | orquestrador e `testes` | — | 17, 21, 24 |

### Grafo
```
gate ─ 1 ─┬─ 2 ─ 3 ─ 4 ─┐
          └─ 5 ─────────┴─ 6 ─ [checkpoint 1: T12, T22] ─ 7 ─┬─ 9 ─┐
             2,5 ─ 8 ────────────────────────────────────────┼─ 10 ┼─ (E1)
             4 ─ 11 ─────────────────────────────────────────┘     │
E1 ─ 12 ─ 13 ─ 14 ─┬─ 15 ─┐                                        │
                   ├─ 16 ─┼─ (E2) ── [checkpoint 2: linha de corte do E3]
                   └─ 17 ─┘
E2 ─ 18 ─┬─ 19 ─┬─ 21 ─ (E3)
         └─ 20 ─┘
E1 ─ 22 ─┐
gate ─ 23 ┴─ 24 ─ (E4)
25 depois de 17, 21 e 24
```
- **Paralelo:** 5 com 2 a 4; 8 e 11 com 6/7; 9 e 10 entre si; 15, 16 e 17 entre si; 19 e 20; o E4 (22 a 24) em paralelo com o E2 e o E3.
- **Dependência dura:** o modelo (tarefas 3 a 6) e o checkpoint 1 vêm antes de qualquer contrato. A autorização (13) vem antes das rotas novas.

## 11. Testes previstos
Projeto `server/tests/CronoAI.Api.Testes`, exceto T78/T79 (`node --test`).
- **(U)** = unidade, sem Docker.
- **(I)** = integração com Testcontainers, conectada como **`cronoai_app`** com contexto.
- **(boot)** = superusuário, **só na fixture**, para produzir estado ou como controle positivo.
- **(mut)** = controle por mutação.
- **CN** = controle negativo.

### 11.0 Lições do 00012 e do 00013 aplicadas (valem para todos os testes abaixo)
1. **RLS:**
   - `pg_policies` com **`qual` e `with_check` exatos** (golden copiado da saída real, espaços normalizados);
   - negativos de UPDATE e DELETE **sem `WHERE`, sem `RETURNING`** e, no UPDATE, com **`SET` constante** (`SET atualizado_em = '2030-01-01T00:00:00Z'`). `SET x = x` também mascara, porque lê a coluna e aplica a política de SELECT;
   - **controle por mutação descrito:** cada negativo de política de escrita tem um irmão `*_mutacao`. Numa transação do superusuário: `ALTER POLICY ... USING (true)` (ou `WITH CHECK (true)`, ou `ALTER TABLE ... DISABLE TRIGGER` para o gatilho de membro) → `SET LOCAL ROLE cronoai_app` → `set_config('app.*', ..., true)` → o mesmo DML → **afirma que agora afeta as linhas proibidas** → `ROLLBACK`. Isso prova que o negativo depende da política. É o mesmo mecanismo do T18 do 00013 (desvio 11, aceito com registro).
2. **Isolamento por rota** com recurso **real** da outra empresa (obra, membro, obra + membro) **e** obra real **sem vínculo** da mesma empresa, pelo **montador único** `RequisicaoDeIsolamento`, com meta-teste.
3. **TypedResults:** `Results<…>` exato por rota (§3.7 e §3.5), status declarados, nada inalcançável; regiões do ADR 00004.
4. **Regras do `validar-regras`** por linha do SQL, sem exigir a chamada na mesma linha; schema, aspas e `ONLY` opcionais; `MERGE`; aspas escapadas. `npm run lint` é gate, porque o ESLint percorre `.claude/scripts`.
5. **`jsonb` do cliente:** nenhuma rota deste ciclo recebe `jsonb`. Se alguma passar a receber, recusar número exponencial ou com mais de 32 caracteres no domínio (padrão do 00013).
6. **Atomicidade:** provar rollback com a trilha **já inserida** e a falha **depois** dela (T30 diferido no `COMMIT`; T31 com sonda de ordem dos comandos). Injetar a falha na própria trilha não prova nada.
7. **Limite de taxa** em rota autenticada: por usuário, não por IP (nenhum novo aqui; §3.7).
8. **Matriz de evidências do HEAD:** o `testes` e o orquestrador reexecutam os gates ao fim de cada rodada.
9. **Migração nova**, nunca reescrever a `ObrasAuditoria` (já com push).

**Cenário-base dos testes de banco** (parecer §5):
- empresa X:
  - A: administrador, escopo `todas`;
  - B: engenheiro, `vinculadas` à obra1;
  - C: gestor, escopo `carteiras`, com acesso à carteira K, que contém a obra2;
  - G: gestor, escopo `todas`;
  - D: engenheiro sem vínculo;
  - R: engenheiro vinculado, depois removido;
  - F: encarregado fictício, vinculado à obra1 e à frente1 (criado pela fixture);
- empresa Y: Z, administrador;
- obras obra1, obra2 e obra3 (X) e obraY (Y); carteira K2 arquivada contendo a obra3.

### 11.1 Domínio e helper (U)
| # | Teste | AC | Resultado esperado | CN |
|---|---|---|---|---|
| T01 | `Membro_par_perfil_escopo` (Theory: os 7 perfis × 3 escopos) | AC-3 | Válidos exatamente os pares do parecer §1.1; os outros → `ArgumentException` | pares válidos passam |
| T02 | `Membro_remover_e_reativar_so_mudam_remocao` | AC-7 | Só `RemovidoEm`/`AtualizadoEm` mudam; remover removido e reativar ativo lançam | — |
| T03 | `Frente_criar_valida_campos` (nome vazio, 201 caracteres, `\0`; `responsavel_texto` com 121 caracteres ou controle; os dois responsáveis juntos) | AC-6 | `ArgumentException` com o campo; nome aparado | caso válido passa |
| T04 | `Carteira_criar_valida_tipo_e_nome` | AC-6 | Tipo fora de `regional`/`cliente`/`gestor` lança | válidos passam |
| T05 | `Matriz_cobre_toda_acao_e_todo_perfil` | AC-9 | Para cada ação × perfil há entrada explícita; consultar ação desconhecida lança | — |
| T06 | `Matriz_igual_a_tabela_do_plano` | AC-9 | Tabela **literal** no teste (cópia do §3.5) = `MatrizPermissoes`. Mudar a matriz exige mudar o teste de propósito | perfil a mais no código reprova |
| T07 | `Vinculos_recusam_ids_vazios` | AC-6 | `Guid.Empty` em qualquer id lança | — |
| T37 | `Helper_recusa_politica_de_escrita_na_auditoria` (`RlsHelperTestes`) | AC-18 | `PoliticaUpdate("auditoria", …)`, `PoliticaDelete("auditoria", …)` e `SubstituirPoliticaUpdate("auditoria", …)` lançam | `PoliticaUpdate("obra", …)` não lança |

### 11.2 Banco (I)
| # | Teste (parecer) | AC | Resultado esperado | CN |
|---|---|---|---|---|
| T11 | `Comparador_de_predicados_detecta_afrouxamento` (T1) | AC-4 | Numa transação do superusuário: `ALTER POLICY pol_obra_select … USING (true)` e `pol_auditoria_insert WITH CHECK (true)`; o comparador do X9, rodado **na mesma transação**, aponta as duas; `ROLLBACK` | sem a mutação, o comparador passa |
| T12 | `Sem_recursao_em_nenhuma_tabela_nem_contexto` (T11, parte) | AC-4 | `SELECT` em todas as tabelas do schema e um UPDATE/DELETE sem efeito (constante) em cada tabela com política de escrita, sob A, B, C, D, G, R, F, Z e vazio: nenhum 42P17 | (boot) com uma política de teste que cita a própria tabela, em transação desfeita: 42P17 (prova que o teste detecta) |
| T13 | `Obra_visivel_por_escopo` (T2) | AC-4 | A = {1,2,3}; B = {1}; C = {2}; G = {1,2,3}; D = {}; R = {}; F = {1}; Z = {Y}; vazio = {}; carteira arquivada não concede a obra3 a C | (boot) vê as 4; A com `removido_em` → {} |
| T14 | `Obra_update_sem_where_respeita_alcance` (T3) (+mut) | AC-4 | B: `UPDATE cronoai.obra SET atualizada_em = '2030-01-01T00:00:00Z'` (sem `WHERE`, sem `RETURNING`) afeta 1; obra2 e obra3 intactas; `SET empresa_id = Y` → 42501 | A afeta 3; mutação do `USING` faz B afetar 3 |
| T15 | `Obra_insert_so_escopo_todas` (T4) | AC-4 | B e C: INSERT → 42501; A e G: ok com `RETURNING` | A com `empresa_id = Y` → 42501 |
| T16 | `AcessoObra_leitura_e_escrita` (T5) (+mut) | AC-6 | B lê só os próprios; A e G leem todos; B insere → 42501; `DELETE FROM cronoai.acesso_obra` (sem `WHERE`) por B afeta 0 (contagem pelo boot); **C insere na obra2 e não na obra1/obra3** (42501); C apaga sem `WHERE`: só os vínculos da obra2 | A apaga 1; mutação do `USING` do DELETE faz B apagar |
| T17 | `AcessoFrente_leitura_e_escrita` (+mut) | AC-6 | Mesmo roteiro do T16 em `acesso_frente` | idem |
| T18 | `Frente_por_visibilidade_da_obra` (+mut) | AC-6 | B lê só frentes da obra1; `UPDATE cronoai.frente SET atualizada_em = '2030-…'` (sem `WHERE`) por B afeta só as da obra1; INSERT de frente na obra2 por B → 42501; DELETE → 42501 (sem privilégio) | mutação do `WITH CHECK` deixa B inserir na obra2 |
| T19 | `Carteiras_por_escopo_e_escrita_so_administrador` (+mut) | AC-6 | C lê K (não K2 se não atribuída); `carteira_obra` de K visível a C; INSERT/DELETE em `carteira*` e `acesso_carteira` por C ou G → 42501 / 0 linhas; A ok; DELETE em `carteira` → 42501 | mutação deixa C apagar `carteira_obra` |
| T20 | `Fks_compostas_por_empresa` (T6) | AC-6 | Os 6 casos do parecer → 23503; revogar `acesso_obra` com `acesso_frente` pendente → 23503 | caso válido de cada um passa; `Fks_do_schema_sao_restrict` e `Identificadores_cabem_em_63_bytes` cobrem as tabelas novas |
| T21 | `Membro_checks_e_enum` (T7) | AC-3 | Perfil desconhecido, escopo inválido e pares proibidos → 23514; valores dos CHECKs = constantes C# (`pg_get_constraintdef`) | constante a mais no código reprova |
| T22 | `Membro_update_so_administrador` (+mut) | AC-5 | B, C e G (`E = X`): `UPDATE cronoai.membro_empresa SET atualizado_em = '2030-…'` (sem `WHERE`) → 42501 pelo gatilho, nada muda; A afeta só os membros de X (Y intacta); `SET usuario_id = …` → 42501 (privilégio por coluna) | mutação (`DISABLE TRIGGER` na transação) deixa B atualizar |
| T23 | `Ultimo_administrador` (T8) | AC-5 | Rebaixar ou remover o último administrador falha no `COMMIT` (`ck_empresa_tem_administrador`); promover B e rebaixar A na mesma transação passa; **dois administradores se rebaixando em paralelo** (`Task.WhenAll`): 1 sucesso, 1 falha, a empresa fica com 1 administrador | com 2, rebaixar 1 passa; `tgenabled = 'A'` |
| T24 | **`Membro_insert_recusado_para_aplicacao`** (escalada) | AC-5 | Como app com `E = X` e `U = B`: INSERT de `membro_empresa` para B mesmo, para um usuário novo e para `empresa_id = Y` → **42501** em todos; `has_table_privilege('cronoai_app','cronoai.membro_empresa','INSERT') = false`; nenhuma política de INSERT em `pg_policies` | (boot) insere (prova que a tabela aceita a linha) |
| T25 | `Remocao_logica_no_banco` (T9, parte banco) | AC-7 | Depois de `removido_em` em R: obra invisível; `empresa` invisível; `acesso_obra` inerte; `acesso_carteira` inerte; uma asserção por ponto | antes da remoção, os mesmos pontos dão acesso |
| T26 | `Privilegios_por_tabela_e_coluna` (T10) | AC-5 | `has_column_privilege` UPDATE verdadeiro só nas 4 colunas de membro; sem INSERT/DELETE em membro; sem DELETE em obra, frente, carteira e auditoria; DELETE só nos 4 vínculos; sem UPDATE nos 4 vínculos; auditoria só SELECT/INSERT; sem TRUNCATE/TRIGGER/REFERENCES | `obra.UPDATE` verdadeiro |
| T27 | `Auditoria_por_visibilidade` (T13) | AC-8 | B lê a trilha da obra1 e não a da obra2; linhas de `obra_id` nulo só para A; `SELECT motivo` sob B nunca traz motivo da obra2; INSERT com `usuario_id <> U` → 42501; INSERT em obra invisível → 42501; append-only intacto (`AppendOnlyTestes` sem alteração; `pg_policies` da trilha só SELECT/INSERT; `tgenabled = 'A'`) | A lê todas; mutação de `pol_auditoria_insert` (+mut) deixa gravar com outro usuário |
| T28 | `Interceptor_remove_vinculo_com_acao_remover` | AC-8 | `Remove(acessoObra)` + `SalvarAuditadoAsync` → 1 linha `remover`, `antes` = `{obra_id, usuario_id}`, `depois` nulo, `obra_id` preenchido | `Remove(obra)` e `Remove(frente)` continuam lançando |
| T29 | `Interceptor_entidade_id_e_obra_id` | AC-8 | Membro: `entidade = 'membro_empresa'`, `entidade_id = usuario_id`, `obra_id` nulo; frente e acesso: `obra_id` da obra; carteira: nulo; troca só de `responsavel_texto` → `alterar` com `{}` | — |
| T30 | `Atomicidade_falha_no_commit_com_trilha_inserida` | AC-8 | Rebaixar o último administrador por `SalvarAuditadoAsync`: a trilha **foi** inserida no lote e o gatilho diferido falha no `COMMIT` → 0 linhas de trilha novas e membro intacto (contagem pelo boot) | com 2 administradores, 1 trilha e o membro alterado |
| T31 | `Atomicidade_trilha_antes_do_delete_que_falha` | AC-8 | `Remove(acessoObra)` com `acesso_frente` pendente. Sonda (`DbCommandInterceptor` só do teste) registra a ordem: o `INSERT INTO cronoai.auditoria` saiu **antes** do `DELETE` que falha com 23503 → 0 trilha e vínculo intacto | se a sonda mostrar outra ordem, o teste falha por "não prova" (`Assert` explícito da ordem) |
| T32 | `Versao_por_gatilho_em_frente_e_carteira` | AC-6 | Nasce 1; `UPDATE SET versao = 999, nome = …` → 2 | — |
| T33 | `Membro_versao_xmin` | AC-13 | Dois contextos leem; A grava; B com o `xmin` velho → `DbUpdateConcurrencyException`; o `UPDATE` funciona com `GRANT` só por coluna | B relê e grava |
| T34 | `Migracao_PerfisPermissoes_up_down_up` (T15) | AC-2 | Banco com membros antes da migração: backfill = todos administrador/`todas`; `Down` deixa `pg_policies` **idêntico** ao golden do 00013, devolve `GRANT INSERT` e remove tabelas e colunas; `Up` de novo passa; has-pending limpo | (boot) numa transação desfeita: `SET NOT NULL` com perfil nulo falha (prova que o backfill é necessário) |
| T35 | `Provisionamento_restaura_force_e_exige_administrador` | AC-17 | Provisiona empresa + administrador + engenheiro: linhas criadas, `relforcerowsecurity = true` em `membro_empresa` depois; sem administrador → falha e **nada** fica (inclusive o `NO FORCE`); app continua sem INSERT | provisionamento válido |
| T36 | `Politica_por_obra_desempenho_referencia` (T17, **informativo**, sem limite que reprove) | — | Tabela sintética de 6.000 linhas com `obra_id` e o padrão `IN (SELECT id FROM cronoai.obra)`: tempo sob A e B; `EXPLAIN` com `hashed SubPlan`/InitPlan; números no ciclo | mesma leitura com `EXISTS` correlacionado e sem RLS |
| T38 | `Indices_previstos_sem_duplicata` | AC-6 | Os índices do §07.4 existem; nenhum par de índices com as mesmas colunas na mesma tabela | — |

### 11.3 Arquitetura (U)
| # | Teste | AC | Resultado esperado |
|---|---|---|---|
| T41 | `Responsavel_texto_fora_da_lista_branca` | AC-8 | `ListaBrancaAuditoria.Campos(typeof(Frente))` sem `responsavel_texto` |
| T42 | `Toda_rota_de_dado_declara_acao_da_matriz` | AC-9 | Enumerando o `EndpointDataSource`: toda rota de `/api/v1` fora de `autenticacao`, `eu`, `empresas` e `desenvolvimento` tem exatamente um `RequisitoPermissao` cuja ação existe na matriz |
| T43 | `Sem_sql_de_escrita_em_tabela_auditada_fora_de_migracao` | AC-18 | O critério da R18 ampliada vale em todo `server/src`; única exceção: `Rls/ProvisionamentoEmpresa.cs` |

### 11.4 Sessão, autorização e rotas existentes (I)
| # | Teste | AC | Resultado esperado | CN |
|---|---|---|---|---|
| T50 | `Matriz_perfil_x_rota` (T16, parametrizado, sem UI) | AC-9, AC-10 | Para cada um dos 7 perfis × as 15 rotas de dado: status da **tabela literal do teste** (independente da `MatrizPermissoes`), com obra **visível** ao perfil; 403 com `type = acao-nao-permitida`; nenhuma escrita nem trilha nos 403 | administrador passa em tudo |
| T51 | `Obra_sem_vinculo_404_identico_ao_inexistente` | AC-10 | Engenheiro de planejamento sem vínculo: GET, PUT e trilha da obra1 → 404 com corpo igual ao de um id inexistente (exceto `traceId`); obra intacta; 0 trilha | o mesmo usuário com vínculo → 200 |
| T52 | `Listagem_de_obras_por_escopo` | AC-10 | A: 3; B: 1; D: 0; G: 3; nenhuma de Y | — |
| T53 | `Cadastro_da_obra_so_administrador` (T18) | AC-11 | Engenheiro de planejamento vinculado: PUT mudando `nome` → 403 `campo-nao-permitido` com `campos = ["nome"]`, sem gravar nem auditar; PUT só com `dataStatus` → 200; administrador renomeia → 200; administrador para o nome de outra ativa → 409 `obra-nome-duplicado` | o mesmo PUT com o nome atual (com espaços) → 200 |
| T54 | `Criar_arquivar_restaurar_so_administrador` | AC-11 | Os outros 6 perfis → 403, sem obra criada nem trilha | administrador → 201/200 |
| T55 | `Trilha_por_matriz_e_visibilidade` | AC-11 | Encarregado, suprimentos e diretoria → 403; engenheiro vinculado lê a obra1 e recebe 404 na obra2 | — |
| T56 | `Exportacao_so_administrador_com_trilha_da_empresa` | AC-11 | Não administrador → 403; administrador: o CSV contém a linha de troca de perfil (`obra_id` vazio) | — |
| T57 | `Sessao_traz_perfil_em_uma_consulta` | AC-12 | `ValidarSessaoAsync` devolve perfil e escopo; contador de comandos do teste = 1 consulta por requisição autenticada | — |
| T58 | `Remocao_logica_nos_fluxos_de_identidade` (T9, parte API) | AC-7, AC-12 | Depois de remover R: a requisição seguinte com o cookie dele → 401 (sessão rejeitada); `MinhasEmpresasAsync` sem X; `PUT /empresas/atual` para X → 404; `/eu` sem X | antes da remoção, os mesmos pontos funcionam |
| T59 | `Eu_traz_perfil_e_escopo` | AC-12 | `perfil` e `escopoObras` da empresa ativa; nulos sem empresa ativa | — |
| T60 | `Responsavel_da_obra_precisa_estar_ativo` | AC-11 | Criar ou editar com responsável removido, alheio ou inexistente → o mesmo 400 em `responsavelId` | membro ativo → 201/200 |

### 11.5 Membros e acessos de obra (I)
| # | Teste | AC | Resultado esperado | CN |
|---|---|---|---|---|
| T61 | `Listar_membros` | AC-13 | Administrador e gestor → 200 com nome e perfil, só membros de X, sem `emissor`/`sujeito` no corpo; `incluirRemovidos=true` só para o administrador (gestor → 403); outros → 403 | — |
| T62 | `Alterar_perfil` | AC-13 | 200 com a nova `versao` e 1 trilha `alterar` (`perfil`/`escopo_obras` em antes/depois); versão velha → 409 `conflito-de-versao` com `estadoAtual`; par inválido → 400; `encarregado` → 400 `perfil-indisponivel`; rebaixar o último administrador → 409 `ultimo-administrador` e **0** trilha | escopo derivado para engenheiro |
| T63 | `Remover_e_reativar` | AC-13 | 200 + trilha `remover`/`restaurar`; responsável de obra → 409 `membro-responsavel` com a lista de ids; remover removido → 409 `membro-removido`; reativar ativo → 409 `membro-nao-removido` | — |
| T64 | `Membro_de_outra_empresa_404_identico` | AC-14 | PUT, remover e reativar com `usuarioId` de Y → 404 igual ao de inexistente; Y intacta | membro de X → 200 |
| T65 | `Conceder_listar_revogar_acesso` | AC-14 | 201 + `Location`; a listagem traz o vínculo; revogar → 204 e apaga também os `acesso_frente` do usuário na obra, com 1 trilha `remover` por linha | — |
| T66 | `Conceder_acesso_destino_invalido_mesmo_400` | AC-14 | Membro de Y, uuid inexistente, membro removido, membro com escopo `todas` → 400 em `usuarioId`, corpos iguais (exceto `traceId`) | engenheiro ativo → 201 |
| T67 | `Conceder_acesso_duplicado_409` | AC-14 | Repetido → 409 `acesso-existente`; dois em paralelo → 1×201 e 1×409 | — |
| T68 | `Gestor_atribui_so_no_alcance` | AC-14 | C concede na obra2 → 201 e na obra1 → 404; G concede na obra1 → 201 | — |
| T69 | `Toda_rota_de_escrita_nova_gera_uma_trilha` | AC-16 | Para cada escrita nova do catálogo: delta exato de trilha (1, ou 1 + n na revogação com frentes) com a ação esperada; rota nova sem caso reprova | — |
| T70 | `Logs_sem_nome_nem_motivo` | AC-16 | `LogsEmMemoria` sem o nome de exibição nem o motivo; com os ids | — |
| T71 | `Rotas_novas_sem_empresa_ativa_403` | AC-15 | As 7 → 403 `empresa-ativa-necessaria` | — |

### 11.6 Isolamento (I) e regras (node)
| # | Teste | AC | Resultado esperado |
|---|---|---|---|
| T76 | `Obra_sem_vinculo_da_mesma_empresa_em_toda_rota_de_obra` | AC-15 | Para cada rota com `{id}` de obra: o usuário declarado no catálogo (tem a ação, não tem a obra) recebe o status declarado (404, ou 403 quando a ação é só de perfis `todas`, com `NaoSeAplica` justificado); nenhum marcador (nome da obra) no corpo |
| T77 | `Concretizacao_usa_recursos_reais` (meta; estende o existente) | AC-15 | Pelo **montador único**: o `{id}` de `ComIdDeOutraEmpresa` é obra que existe em Y; o `{usuarioId}` é membro de Y; no cenário sem vínculo, a obra existe **em X** e é invisível ao usuário do cenário (conferido pelo boot e pelo administrador de X) |
| T78 | R18 ampliada (casos) | AC-18 | **Acusa** `INSERT INTO cronoai.membro_empresa`, `UPDATE "acesso_obra"`, `DELETE FROM ONLY cronoai.frente`, `MERGE INTO carteira_obra`, `\"acesso_carteira\"` escapada, SQL na linha abaixo da chamada, em `CronoAI.Api`. **Não acusa:** `Rls/ProvisionamentoEmpresa.cs`, `Migrations/`, `SELECT … FROM cronoai.membro_empresa`, comentário, `server/tests/**` |
| T79 | R19 ampliada (alerta) | AC-18 | **Acusa** em `Migrations/`: `PoliticaUpdate("auditoria"`, `SubstituirPoliticaSelect("auditoria"`, com espaço antes da aspa. **Não acusa:** `PoliticaSelect("obra"`; a mesma linha fora de `Migrations/` |

### 11.7 Testes existentes estendidos
| # | Teste | AC | Mudança |
|---|---|---|---|
| X1 | `Migracoes_aplicam_e_reaplicam` | AC-2 | 4 migrações; `Modelo_sem_mudanca_pendente` `false` |
| X2 | `Toda_tabela_tem_rls_forcado_ou_esta_na_lista_global` | AC-4 | As 6 tabelas novas com `FORCE` |
| X3 | `Politicas_sao_por_comando_e_so_para_cronoai_app` | AC-4 | Lista nova; `membro_empresa` sem INSERT e com UPDATE |
| X4 | `Privilegios_da_aplicacao_por_tabela` | AC-5 | `InlineData` das tabelas novas e de `membro_empresa` |
| X5 | `Usuario_da_empresa_A_nao_ve_dado_da_empresa_B_em_nenhuma_rota` | AC-15 | Recursos reais `Membro` e `ObraEMembro`; usuário do teste = administrador (passa a matriz e chega ao 404) |
| X6 | `Dono_tambem_se_sujeita_ao_rls` | AC-4 | 0 linhas nas tabelas novas para o migrador |
| X7 | `Toda_entidade_auditavel_tem_lista_branca` | AC-8 | Cobre as 7 automaticamente |
| X8 | `SementeDesenvolvimentoTestes` | AC-17 | Perfis distintos; `dev-b` vinculado a 1 obra; idempotente; recusa fora de `Development` e sem a string do migrador |
| X9 | `Predicados_das_politicas_sao_os_do_plano` | AC-4 | Golden novo, copiado da saída real |
| X10 | `Entidade_gravavel_de_empresa_e_auditavel_ou_excecao_declarada` | AC-8 | Exceções = `{Sessao, Empresa}` |

Cobertura automática, sem mudança de código: `Toda_rota_registrada_tem_cenario_de_isolamento`, `Toda_escrita_exige_antiforgery`, `Toda_rota_nao_anonima_responde_401_sem_sessao`, `Identificadores_cabem_em_63_bytes`, `Fks_do_schema_sao_restrict`, `Modelo_so_tem_fks_restrict`, `PoolRlsTestes` (sem variável nova neste ciclo).

**Totais:** 64 testes novos (T01 a T07, T11 a T38, T41 a T43, T50 a T71, T76 a T79; os números T08 a T10, T39, T40, T44 a T49 e T72 a T75 não são usados) e 10 existentes estendidos (X1 a X10). Com as Theories e a parametrização do T50 (7 × 15), passa de 250 casos.

## 12. Critérios de aceite e escopo fechado
- **AC-1:** `restore --locked-mode`, build Release com 0 avisos, `format` limpo, `dotnet test` verde, diff do OpenAPI vazio depois do build, has-pending limpo, sem pacote vulnerável.
- **AC-2:** migração **nova** `PerfisPermissoes` com o modelo do §07. Aplica, reaplica, `Down` restaura o golden do 00013 e `Up` de novo passa. **`git diff` de `20261025201449_ObrasAuditoria*` vazio.**
- **AC-3:** 7 perfis e 3 escopos com o CHECK do par; CHECK = constantes C#; backfill Q10.
- **AC-4:** RLS por obra:
  - visibilidade por escopo exatamente como no T13;
  - INSERT de obra só para escopo `todas`;
  - UPDATE sem `WHERE` respeita o alcance;
  - predicados exatos (golden), com controle por mutação;
  - nenhum 42P17 em nenhum contexto;
  - `FORCE` nas tabelas novas.
- **AC-5:** escalada fechada:
  - o app **não insere** `membro_empresa` (42501 por privilégio e sem política);
  - UPDATE de membro só por administrador ativo (gatilho);
  - colunas imutáveis por privilégio;
  - último administrador garantido, inclusive em concorrência.
- **AC-6:** vínculos, frentes e carteiras no banco:
  - FKs compostas (23503 igual para inexistente e alheio);
  - escrita só do administrador ou do gestor no alcance;
  - DELETE só nos 4 vínculos e UPDATE em nenhum deles;
  - versão por gatilho em frente e carteira;
  - carteira arquivada não concede.
- **AC-7:** remoção lógica nega acesso em todos os pontos (obra, empresa, vínculos, sessão, "minhas empresas", empresa ativa, `/eu`), uma asserção por ponto.
- **AC-8:** trilha:
  - leitura pela visibilidade da obra; `obra_id` nulo só para o administrador;
  - INSERT com `usuario_id = U`; append-only intacto;
  - `remover` para vínculo; `entidade_id` do membro = `usuario_id`;
  - lista branca sem `responsavel_texto`;
  - atomicidade provada com a trilha já inserida (T30, T31).
- **AC-9:** matriz perfil × ação em código (§3.5), aplicada por políticas; teste parametrizado perfil × rota sem UI, com golden próprio; toda rota de dado declara uma ação.
- **AC-10:** obra sem vínculo → **404** idêntico ao de inexistente (divergência com a SPEC-02 registrada); ação fora da matriz → 403 `acao-nao-permitida`, sem escrita nem trilha.
- **AC-11:**
  - cadastro da obra (nome, UF, município, responsável, SINAPI) só pelo administrador (403 `campo-nao-permitido`), o que fecha o oráculo do 409;
  - criar, arquivar, restaurar e exportar só pelo administrador;
  - trilha pela matriz e pela visibilidade;
  - responsável da obra precisa estar ativo.
- **AC-12:** perfil e escopo na mesma consulta da sessão; `/eu` com perfil; empresa ativa só com vínculo ativo.
- **AC-13:** gestão de membros (listar, perfil com `versao` por `xmin`, remover, reativar) com trilha e os 409 do §3.7; `encarregado` indisponível (Q2).
- **AC-14:** acessos de obra (listar, conceder, revogar), com o gestor só no alcance; revogar apaga os `acesso_frente` na mesma transação; destino inválido com o mesmo 400; duplicata 409.
- **AC-15:** isolamento:
  - recursos reais de Y (obra, membro, obra + membro);
  - obra real sem vínculo de X;
  - montador único e meta-teste;
  - nenhum marcador;
  - sem empresa ativa → 403.
- **AC-16:** toda escrita nova grava exatamente a trilha esperada; logs sem nome nem motivo.
- **AC-17:** semente de desenvolvimento pelo provisionamento (perfis distintos, obra vinculada, `FORCE` restaurado, só `Development`); `DadosTeste` com um administrador por empresa.
- **AC-18:**
  - R18 ampliada (bloqueia) e R19 ampliada (alerta), com casos verdes;
  - guarda do helper;
  - `validar-regras --base feat/00013-obras-auditoria` com 0 bloqueios e o alerta R19 esperado, conferido;
  - `npm run lint` verde.
- **AC-19:** documentação:
  - ADR 00010 (`Proposto`);
  - ADRs 00004, 00006 e 00009 ajustados;
  - `backend-dotnet.md`, checklist;
  - notas na SPEC-01, SPEC-02 e SPEC-14;
  - PLANO §5.4;
  - `CLAUDE.md`, `server/README.md`.
- **AC-20:** front intacto (nada em `src/`, `e2e/`, `Dockerfile`, `docker/`, compose, `.github/`); `npm run ci` verde.
- **AC-21:** contratos das 7 rotas novas e das 9 alteradas exatamente como no §3.7 e no §3.5 (`Results<…>`, `.ProducesProblem`, nada inalcançável), no OpenAPI regenerado.

### Matriz de verificação prevista
| Item | Requisito | Verificação | Obrig. |
|---|---|---|---|
| G-restore, G-build, G-format, G-test, G-openapi, G-pending, G-vuln | Gates do backend | comandos do AC-1, **no HEAD** de cada rodada | sim |
| G-node | Regras | `node --test .claude/scripts/lib/regras-cronoai.test.mjs` | sim |
| G-regras | validar-regras | `validar-regras.mjs --base feat/00013-obras-auditoria --commits` | sim |
| G-classif | classificar-diff | `classificar-diff.mjs --base feat/00013-obras-auditoria --faixa 3` | sim |
| G-lint | ESLint (inclui `.claude/scripts`) | `npm run lint` | sim |
| AC-1 | Gates | acima | sim |
| AC-2 | Migração | T34, X1, checkpoint 1, `git diff` vazio da `ObrasAuditoria` | sim |
| AC-3 | Perfis | T01, T21, T34 | sim |
| AC-4 | RLS por obra | T11 a T15, X2, X3, X6, X9 | sim |
| AC-5 | Escalada e membro | T22 a T24, T26, X4 | sim |
| AC-6 | Vínculos, frentes, carteiras | T03, T04, T07, T16 a T20, T32, T38 | sim |
| AC-7 | Remoção lógica | T02, T25, T58 | sim |
| AC-8 | Trilha | T27 a T31, T41, X7, X10 | sim |
| AC-9 | Matriz | T05, T06, T42, T50 | sim |
| AC-10 | 404 x 403 | T50, T51, T52 | sim |
| AC-11 | Cadastro, criar, arquivar, exportar | T53 a T56, T60 | sim |
| AC-12 | Sessão | T57 a T59 | sim |
| AC-13 | Membros | T33, T61 a T63 | sim |
| AC-14 | Acessos | T64 a T68 | sim |
| AC-15 | Isolamento | T71, T76, T77, X5 | sim |
| AC-16 | Trilha por rota e logs | T69, T70 | sim |
| AC-17 | Provisionamento e semente | T35, X8 | sim |
| AC-18 | Regras | T37, T43, T78, T79, G-regras, G-lint | sim |
| AC-19 | Documentação | `git diff --name-only` | sim |
| AC-20 | Front intacto | `npm run ci`; `git diff --name-only` | sim |
| AC-21 | Contratos | OpenAPI regenerado + leitura do `arquiteto` contra o §3.7 | sim |
| R-1 | Camadas | `ArquiteturaTestes` | sim |
| R-2 | DDL só em migração e `Rls/`; DML de migração só pelo helper; SQL de escrita auditada só no provisionamento | R15, R18, T43 | sim |
| R-3 | Estilo do ADR 00004 | leitura do `arquiteto` | sim |
| R-4 | Evidência do HEAD (lição 8) | cada linha cita o SHA da execução | sim |
| S-1 | Sem segredo versionado | `ConfiguracaoTestes`, R08 | sim |
| S-2 | Nenhuma dependência nova | diff de `Directory.Packages.props` e dos lock files vazio | sim |
| S-3 | Atribuição em massa | T62, T65 (corpo sem `empresaId`; extras ignorados) | sim |
| S-4 | CSRF nas escritas novas | `Toda_escrita_exige_antiforgery` | sim |
| S-5 | Erro sem detalhe interno | T62, T66 | sim |
| S-6 | Limite de corpo | 413 com 9 KB nas escritas novas (no T62) | sim |
| S-7 | Testes de banco como `cronoai_app` (boot só na fixture e nas mutações) | leitura | sim |
| S-8 | String do migrador só no comando de semente, só em `Development` | T35, X8, leitura | sim |
| V-1 | **Usuário revisa no PR** as decisões do gate (Q1 a Q11, Q3 do arquiteto, 404 × 403, divisão) | PR | sim |
| V-2 | Subida local: login `dev-a` (administrador) e `dev-b` (engenheiro): `dev-b` lista 1 obra; 404 em obra sem vínculo; 403 ao criar; `dev-a` concede e revoga acesso e troca perfil | orquestrador, curl | não |
| AUD | Auditoria independente | `revisor` em modo AUDITAR | sim |

**Validadores** (etapa 7, em paralelo, com as saídas `dotnet`, `node --test` e `npm run lint` no prompt, todas do HEAD):
- **`arquiteto`:** plano, camadas, matriz, contratos (AC-21), escopo fechado;
- **`dba`:** migração, gatilhos, políticas, recursão, privilégios, índices, golden, mutações;
- **`seguranca`:** §08, escalada, oráculos, provisionamento, minimização;
- **`testes`:** execução completa e a matriz;
- **auditoria independente:** depois dos quatro.

### Fora do escopo (explícito)
- **Convite** (`convite_membro`, token, aceite, envio de e-mail) e **`usuario` sob RLS** com variáveis de login: 00014c, depois do parecer da Segurança (Q6).
- **API de frentes, acessos de frente, carteiras, obras da carteira e acessos de carteira:** 00014b. O banco delas entra aqui.
- Filtro de dado por frente ("encarregado só vê as suas frentes"): 00015/00018. Coluna `restringe_por_frente`: decisão do 00018 (parecer §2.4).
- Membro com perfil `encarregado` pela API; login de trabalhador; telefone de qualquer pessoa (RNF-02.3).
- Comando de provisionamento de empresa em produção (Q8): Infraestrutura e produto.
- "Encarregado não aprova o próprio relato" (00018); "quatro olhos" de linha de base (RF-02.6).
- Rota de leitura da trilha da empresa (`obra_id` nulo) fora da exportação.
- Perfil por obra (Q1); hash encadeado; particionamento; IP na trilha (Jurídico).
- Limite de taxa novo; `ETag`/`If-Match`.
- Front (00019/00020); nada em `src/`.
- CI, compose, Dockerfile, imagens, Dependabot; qualquer hospedagem.
- Alterar as migrações `IdentidadeEmpresas` e `ObrasAuditoria`.

## 13. Validações com outras áreas
Registradas como pendência; este plano não decide por elas.

| Tema | Área | Antes de quê |
|---|---|---|
| **Convite por token** (recomendado pelo parecer) × e-mail verificado; exposição de **`emissor` + `sujeito`** dos colegas sob a empresa ativa × tabela `identidade_externa` separada (Q6). Bloqueia o início do 00014c | **Segurança da Informação** | Plano do 00014c |
| Gatilho como controle de autorização em `membro_empresa`; uso da credencial do **migrador** na semente de desenvolvimento e o futuro comando da Q8; aceite dos itens ASVS V2, V4, V7, V8, V14 e V16 | **Segurança da Informação** | Uso em produção |
| **Perfil Encarregado** (trabalhador): login, dados mínimos; **`responsavel_texto`** guarda nome de trabalhador em texto livre (Q2), e nenhum nome real entra sem aval; nomes de frente e de carteira (tipo "gestor") podem conter nome de pessoa e vão para a trilha append-only | **RH + Jurídico** | Cadastro de encarregado ou frente real |
| `removido_em` basta para o desligamento, ou o titular pode pedir pseudonimização do `usuario`? Retenção do convite consumido (00014c). Minimização do `motivo` (omitir para quem não é autor nem administrador) (Q11) | **Jurídico** | Dados reais / piloto |
| **Q8:** como nasce a empresa e o primeiro administrador fora do desenvolvimento (comando explícito, credencial dedicada); **Q10:** contagem de membros por empresa antes de aplicar a migração fora do local; momento de `NOT VALID`/`VALIDATE` e locks da migração | **Infraestrutura** (+ produto na Q8) | Primeiro ambiente fora do local |
| **404 × 403** para obra sem vínculo (emenda do critério da SPEC-02); Q3 (gestor atribui obra e frente); células de opinião da matriz (§3.5); divisão do ciclo (§9) | **Usuário** | Merge (V-1) |

## 14. Riscos e pós-entrega
- **Recursão de política (42P17).** A análise do §3.3 vem do comportamento do reescritor do PostgreSQL, lido e não medido. Mitigação: o T12 roda primeiro (checkpoint 1); o gatilho substitui a política autorreferente; a regra entra no ADR 00010.
- **Predicados longos e golden frágil** a mudança de deparse do PostgreSQL. Mitigação: expressões só no helper; golden copiado da saída real; T11 prova que o comparador detecta mudança (parecer §6.1, risco 3).
- **Custo do RLS por obra** nas tabelas grandes do 00015: é estimativa. T36 informativo; o 00015 mede com 3.000 tarefas.
- **`xmin` com `GRANT UPDATE` por coluna** e o `RETURNING xmin` sob RLS: conferir (T33). Plano B: contador explícito `versao` com gatilho, como na obra (migração nova no próprio ciclo, antes do push).
- **Provisionamento com o migrador:** usa DDL (`NO FORCE`/`FORCE`) em tempo de execução, só em `Development`. O lock exclusivo é curto e o DDL é transacional. Segurança revisa (seção 13).
- **Escopo `carteiras` sem API até o 00014b:** quem o recebe vê zero obras (falha fechada). Documentado no `/eu` e no README.
- **Divergência com a SPEC-02 (404 × 403):** cobertura com nota; decisão do usuário.
- **Tamanho:** mesmo dividido, o 00014 é M/G. Linha de corte no E3 (§9.2).
- **Ordem do lote do EF:** a trilha entra antes do `UPDATE`/`DELETE`. O T31 só prova se a sonda confirmar a ordem; se o EF mudar a ordem numa versão nova, o teste falha por "não prova", e não passa em silêncio.
- **APIs a conferir, todas com teste:**
  - `IsRowVersion` (Npgsql);
  - recursão (T12);
  - `SET CONSTRAINTS ... IMMEDIATE` com gatilho de restrição nomeado;
  - `RAISE ... CONSTRAINT =` chegando como `PostgresException.ConstraintName`;
  - índices de FK redundantes;
  - `has-pending-model-changes` com os índices parciais fora do modelo.
- **Rollback:** reverter os commits. O `Down()` restaura os predicados do 00013 (T34); o banco local sai com `docker compose --profile backend down -v`.
- **Publicação:** nenhuma (Inviolável 8). Versão: decisão do usuário no `/entregar`.

## 15. Decisões do gate e de design

### Decisões do gate (tomadas pelo orquestrador com autorização do usuário, sujeitas à revisão dele no PR)
- **Q1 → perfil por membro** (recomendação do parecer §1.1 e §6.2). Aplicado em §3.2 e §07.1.
- **Q2 → "empreiteiro" é o mesmo perfil do encarregado.** Sem login de trabalhador no 00014: nenhuma rota coloca alguém no perfil `encarregado`. O responsável de frente pode ser texto livre (`responsavel_texto`), com `responsavel_id` opcional (recomendação do parecer §6.2). Aplicado em §3.2, §3.6, §07.1 e T62. **Ressalva:** o texto livre é dado pessoal de trabalhador e fica fora da trilha e dos logs. RH + Jurídico antes de qualquer nome real (seção 13).
- **Q3 → o parecer não traz recomendação explícita.** Decisão do arquiteto, apoiada na SPEC-02 §3: o gestor de portfólio também atribui obra e frente, só no próprio alcance, e o banco cita `gestor_portfolio` pelo nome (parecer §2.2). Aplicado em §3.3, T16, T17 e T68. **Revisar no PR.**
- **Q4 → obra em várias carteiras (N:N); carteira arquivada não concede acesso** (recomendação do parecer §1.4 e §6.2). Aplicado em §07.1, §3.3 e T13.
- **Q5 → nome e cadastro só para quem vê todas as obras (administrador); exportação só para o administrador; `motivo` para quem lê a trilha** (recomendação do parecer §6.2). Aplicado em §3.5, T53 e T56.
- **Q6 → token (recomendação do parecer) e exposição de `emissor` + `sujeito`:** **pendência da Segurança da Informação**, que decide. Nada disso é implementado neste ciclo (00014c).
- **Q7 → manter a unicidade do nome, com a opção 1 do parecer §2.5.** Aplicado em §3.5 e T53.
- **Q8 → recomendação do parecer:** comando administrativo explícito, fora da API, com credencial definida com a Infraestrutura, e nunca auto-reivindicação. **Incluído em parte:** a primitiva `ProvisionamentoEmpresa`, usada só pela semente de desenvolvimento. O comando de produção fica como **pendência de produto e da Infraestrutura** (a credencial não está definida). Aplicado em §3.8.
- **Q9 → obra sem vínculo responde 404**, e não 403, para não revelar existência (ADR 00006; recomendação do parecer §2.6). **A SPEC-02 fala em 403:** a divergência vai ao usuário; a SPEC-02 ganha nota sem reescrever o critério. Aplicado em §3.5, AC-10 e T51.
- **Q10 → todo membro existente vira administrador com escopo `todas`** (recomendação do parecer §4.2), com a conferência da Infraestrutura antes de aplicar fora do local. Aplicado em §07.3 e T34.
- **Q11 → sem recomendação no parecer:** `removido_em` × pseudonimização e retenção do convite são **pendência do Jurídico e do RH**.
- **Escalada de privilégio (INSERT em `membro_empresa` para qualquer usuário): fechada neste ciclo**, com `REVOKE INSERT` + política removida (§3.4, T24). Bloqueante atendido.
- **Convite por token e `emissor`+`sujeito` → Segurança; encarregado e retenção → Jurídico e RH.** Registrado na seção 13; o plano não decide por essas áreas.

### Decisões de processo a confirmar pelo orquestrador
- **Divisão em 00014, 00014b e 00014c (Opção C, §9.1):** recomendada [opinião].
- **Número do ADR novo:** 00010 (00007/00008 reservados pelo PLANO; 00002/00003 da Fase 1). **Conferir** no `/adr`.
- `especialista-obra`: não exigido (T1/T2/T3 = NÃO).

### Decisões de design tomadas no plano, revisáveis no PR
- Gatilho `trg_membro_exige_administrador` no lugar da política de UPDATE autorreferente (ajuste técnico, §3.4).
- `carteira_obra` filtra pela carteira, e não pela obra visível (regra de recursão, §3.3).
- Política de SELECT de `membro_empresa` inalterada (removido visível aos colegas; §3.3).
- `REVOKE UPDATE` nos quatro vínculos.
- `xmin` como versão do membro; vínculos sem versão.
- Revogar acesso de obra apaga os acessos de frente na mesma transação.
- `responsavel_texto` fora da lista branca; no máximo um responsável por frente.
- Matriz do §3.5, com as células de opinião marcadas.
- 403 por perfil antes de carregar o recurso; `campo-nao-permitido` no PUT de obra.
- Provisionamento de desenvolvimento pelo migrador, sem trilha; testes pelo superusuário da fixture.
- Revogar por `POST .../revogar`; limite de corpo de 8 KB nas escritas novas.
- Linha de corte no E3.

## 16. Emenda 01 (25/10/2026) — parecer do `dba` da tarefa 0
Parecer: `00014-tarefa0-dba.md`, `VEREDITO: AJUSTAR`. Onde cada ponto foi aplicado e o que mudou:

| # | Ponto do parecer | Aplicado em |
|---|---|---|
| 1 | Modelo §1.1 a §1.4 (membro, vínculos, frente, carteiras) | §07.1, E1 |
| 2 | `convite_membro` (§1.5), `usuario` sob RLS (§3) e convite sob RLS (§3.3) | **Adiado ao 00014c** (divisão, §9). A escalada é fechada já, por `REVOKE INSERT` |
| 3 | Índices §1.6 | §07.4, T38 |
| 4 | Trilha §1.7 (`EntidadeId`, `remover`, `obra_id`, lista branca) | §3.6, T28, T29, T41 |
| 5 | Remoção lógica §1.8 | §3.2, T25, T58 |
| 6 | RLS por obra e divisão banco/aplicação §2.1 e §2.2 | §3.3, T12 a T19 |
| 7 | Política de UPDATE de `membro_empresa` com `EXISTS` na própria tabela (§2.2) | **Ajustada:** cairia em 42P17 (recursão). Virou gatilho `trg_membro_exige_administrador`, com política `empresa_id = E` (§3.4, T22) |
| 8 | Política de SELECT de `membro_empresa` filtrando removido (§2.2) | **Não aplicada:** a condição "administrador vê removidos" exigiria autorreferência (42P17). Fica `usuario_id = U OR empresa_id = E`; as demais políticas filtram `removido_em` (§3.3) |
| 9 | "`frente` e `carteira_obra`: obra visível pelo mesmo predicado" | **Precisado:** `frente` usa `OBRA_VISIVEL`; `carteira_obra` **não pode** (a política de obra a cita) e filtra pela carteira (§3.3) |
| 10 | Trilha por visibilidade §2.3 | §3.3, T27 |
| 11 | Padrão para as tabelas filhas e custo §2.4 | ADR 00010 (tarefa 23), T36 |
| 12 | Oráculo do 409 §2.5 | Q5/Q7, §3.5, T53 |
| 13 | 403 × 404 §2.6 | Q9, §3.5, T51 |
| 14 | Migração §4.1 | §07.3, com a ordem ajustada: gatilhos de membro **depois** do backfill |
| 15 | Q10 §4.2 | §07.3, T34 |
| 16 | Índice parcial de `sessao` §4.3: não fazer | ADR 00006 (tarefa 24) |
| 17 | Guarda no helper e R19 §4.4 | §07.2, T37, T79 |
| 18 | Down §4.5 | §07.3, T34 |
| 19 | Testes T1 a T20 §5 | T11 a T38 e T50 (mapeados na coluna "parecer" do §11.2). T11 e T12 do parecer (usuario e convite) vão para o 00014c, menos a parte de recursão (T12 aqui) |
| — | Último administrador com advisory lock (§1.1) | §3.4, T23, T30; com `SET CONSTRAINTS IMMEDIATE` no provisionamento (§3.8) |
| — | `REVOKE UPDATE` nos vínculos | **Acrescentado** pelo arquiteto (menor privilégio; o parecer não cobria) |

---

CONHECIMENTO NOVO:
- Política de RLS que consulta a própria tabela dispara 42P17 ("infinite recursion detected in policy") sempre que a política interna tem subconsulta. No CronoAI ela sempre tem, porque `U` e `E` são subconsultas escalares. Logo: nenhuma política de `membro_empresa` cita `membro_empresa`; checagem de "só administrador" na própria tabela vira gatilho `BEFORE UPDATE`. Onde se aplica: toda tabela cuja regra de escrita dependa de outra linha da mesma tabela. A confirmar pelo T12 no checkpoint 1.
- Tabela citada pela política de `obra` (vínculos, carteiras) não pode citar `obra` na própria política (ciclo de expansão). O "alcance" precisa ser expresso pelo caminho das carteiras e vínculos, nunca por `obra_id IN (SELECT id FROM obra)`. Onde se aplica: `carteira_obra`, `acesso_*` e qualquer tabela futura usada para decidir a visibilidade da obra.
- Gatilho de restrição `DEFERRABLE INITIALLY DEFERRED` roda no `COMMIT`. Num fluxo `NO FORCE → DML → FORCE` como migrador, ele rodaria já com `FORCE` e veria zero linhas. É preciso `SET CONSTRAINTS ... IMMEDIATE` antes de restaurar o `FORCE`. Onde se aplica: provisionamento e qualquer DML de migração em tabela com gatilho diferido.
- Revogar o `INSERT` do papel da aplicação (além de remover a política) fecha uma escalada sem esperar o fluxo definitivo, porque são duas camadas independentes. O ciclo que traz o fluxo devolve o `GRANT` junto com a política nova. Onde se aplica: `membro_empresa` até o 00014c.
- O escopo pedido para o 00014 era cerca de 3× o 00013. Dividir por "banco completo + matriz" / "API de frentes e carteiras" / "o que depende de parecer de área" mantém um golden de predicados só e alinha o último ciclo à resposta da Segurança. Onde se aplica: ciclos de backend com modelo grande e superfície de API larga.

## Gate do orquestrador (25/10/2026)

Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR:

- **Divisão:** opção C. Este ciclo 00014 cobre o banco completo, menos o convite e o `usuario` sob RLS, mais a matriz perfil × ação, as rotas existentes, `/eu` e as rotas de membros e de acessos de obra. O 00014b fica com a API de frentes e carteiras. O 00014c fica com o convite e o `usuario` sob RLS, e só começa depois do parecer da Segurança sobre a Q6. A linha de corte no E3 vale.
- **Q1 a Q11:** segue as recomendações do parecer do dba. A Q3, que não tinha recomendação, fica decidida pela SPEC-02 §3: o gestor de portfólio atribui obras e frentes dentro do seu próprio alcance.
- **Obra sem vínculo:** 404, como no ADR 00006. A SPEC-02 fala em 403; a divergência vai para o usuário no PR.
- **Correção do modelo do dba:** gatilho `BEFORE UPDATE` em `membro_empresa`, em vez de política recursiva (risco de erro 42P17), e `carteira_obra` sem citar `obra`. O T12 roda no checkpoint 1 para confirmar. Se o PostgreSQL não der 42P17, a escolha fica registrada e o gatilho continua.
- **Especialista-obra:** dispensado. Não há cálculo nem número de obra neste ciclo.
- **Início:** branch `feat/00014-perfis-permissoes` criada a partir de `feat/00013-obras-auditoria` (1c7cea7).
