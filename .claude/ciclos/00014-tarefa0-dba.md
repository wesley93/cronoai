# Ciclo 00014, tarefa 0: parecer do dba sobre perfis, permissão por obra e frente, carteiras e gestão de membros

Data: 2026-10-25. Modo: LEVANTAMENTO (PLANO-FASE-2 §5.4 e §10; SPEC-01 RF-01.1c; SPEC-02 §3, RF-02.2 a RF-02.5; SPEC-14 RF-14.7/14.8; ADR 00004, 00005, 00006, 00009; `backend-dotnet.md`; worktree `c13` (HEAD 1c7cea7): migrações `IdentidadeEmpresas` e `ObrasAuditoria`, helpers `Rls/`, `ConsultasIdentidade`, `ConsultasAuditoria`, `AuditoriaInterceptor`, `CatalogoTestes`; pareceres 00012 e 00013). Nenhum banco consultado, nada gravado no repositório. Tudo é por leitura de código; o que só o banco real confirma está marcado "conferir" e vira teste.
Legenda: **[prática]** = documentado (link oficial); **[opinião]** = escolha minha; **[exigência]** = requisito da SPEC, do ADR ou do plano. Nada aqui é exigência regulatória. Dado pessoal, retenção e perfil Encarregado: **Jurídico + RH**; não substituo o parecer deles.

```
VEREDITO: AJUSTAR (o plano E1 a E4 cabe no banco, mas seis pontos precisam de decisão antes do plano do arquiteto:
          RLS por obra com recursão controlada, SECURITY DEFINER inviável sob FORCE (convite e login por variável de sessão),
          remoção de membro lógica, trilha por visibilidade da obra, 409 de nome duplicado e 403 x 404)
RESUMO:
- membro_empresa(+perfil text, +escopo_obras text, +removido_em, +atualizado_em) — RLS FORCE — UPDATE só por coluna — OK (§1.1)
- acesso_obra, frente, acesso_frente, carteira, carteira_obra, acesso_carteira, convite_membro — tabelas novas, RLS FORCE, FKs compostas por empresa — OK (§1)
- RLS por obra no banco (visibilidade) + matriz perfil x ação na aplicação — RECOMENDADO (§2)
- auditoria: SELECT por visibilidade da obra; trilha da empresa (obra_id nulo) só administrador; INSERT com usuario_id = contexto — AJUSTE (§2.3)
- usuario sob RLS: POSSÍVEL agora, com variáveis de login (emissor, sujeito) e sem SECURITY DEFINER (§3)
- 409 obra-nome-duplicado vira oráculo de existência: mitigar (§2.5); 403 da SPEC x 404 do ADR 00006: decidir (§2.6)
- índice parcial de sessao: NÃO fazer; manter o índice completo (§4.3)
- helper PoliticaUpdate("auditoria"): guarda no próprio helper + R19 ampliada (§4.4)
MIGRACAO: sim, `PerfisPermissoes` (esboço em §1 e §4)
INDICES SUGERIDOS: §1.6 (app DB)
```

## 0. Premissas e fatos encontrados no código (todos por leitura)

1. **Hoje nenhum caminho de produção cria `empresa` nem `membro_empresa`**: só a semente de desenvolvimento (`SementeDesenvolvimento.cs`, `ON CONFLICT DO NOTHING`). O 00014 entrega o convite, mas **o primeiro administrador de uma empresa real ainda não tem origem** (Q8).
2. A SPEC-02 §3 lista **7 perfis** (administrador, engenheiro de planejamento, engenheiro de obra, suprimentos, encarregado/mestre, gestor de portfólio, diretoria/leitura). Os nomes "apontador" e "leitura" do pedido correspondem ao encarregado e à diretoria. A RF-02.3a cita **"empreiteiro"**, que não é perfil na §3 (Q2).
3. `usuario` **não guarda e-mail** (minimização, 00012). "Convite por e-mail" precisa de um vínculo que não dependa de e-mail guardado (§1.5).
4. **SECURITY DEFINER não resolve nada com FORCE [prática]:** a função roda como o dono (migrador) e, com `FORCE ROW LEVEL SECURITY` e políticas só `TO cronoai_app`, o dono vê zero linhas (parecer 00012, ADR 00006, teste `Dono_tambem_se_sujeita_ao_rls`). A alternativa clássica (função definidora para login e convite) só funcionaria com papel `BYPASSRLS`, que o projeto proíbe. Por isso o desenho usa **variáveis de sessão extras** (§3). Docs: https://www.postgresql.org/docs/current/ddl-rowsecurity.html e https://www.postgresql.org/docs/current/sql-createfunction.html
5. `IAuditavel` exige `Guid Id`. `membro_empresa` e as tabelas de vínculo teriam PK composta: precisam de `id` substituto (ou `EntidadeId` no contrato) para a trilha (`auditoria.entidade_id uuid`; o 00013 já avisou). Decisão em §1.7.
6. `AuditoriaInterceptor` **lança em `EntityState.Deleted`** de entidade auditável. Revogar vínculo exige soft-delete **ou** estender o interceptor (ação `remover`, `antes` = estado). Escolha em §1.7.
7. O `INSERT` de obra e de vínculo usa `RETURNING` (versão por gatilho): sob RLS, o `RETURNING` aplica a política de **SELECT** à linha nova. Quem não enxerga a obra recém-criada tem o INSERT recusado (42501). Consequência em §2.2.

## 1. Modelo de dados proposto

Convenções do ADR 00004 mantidas: schema `cronoai`, snake_case, constraints e índices nomeados à mão (até 63 bytes), ids uuid v7 na aplicação, enum = `text` + CHECK, FK sempre `Restrict`, FK composta `(empresa_id, X)` para o pai com `UNIQUE (empresa_id, id)`, datas UTC pelo `TimeProvider`.

### 1.1 `membro_empresa` (alterada): perfil e escopo

| Coluna | Tipo | Nulo | Constraint / observação |
|---|---|---|---|
| perfil (nova) | text | não | CHECK `ck_membro_perfil IN ('administrador','engenheiro_planejamento','engenheiro_obra','suprimentos','encarregado','gestor_portfolio','diretoria')` |
| escopo_obras (nova) | text | não | CHECK `IN ('todas','vinculadas','carteiras')` |
| (par) | | | CHECK `ck_membro_perfil_escopo`: `(perfil = 'administrador' AND escopo_obras = 'todas') OR (perfil IN ('gestor_portfolio','diretoria') AND escopo_obras IN ('todas','carteiras')) OR (perfil IN ('engenheiro_planejamento','engenheiro_obra','suprimentos','encarregado') AND escopo_obras = 'vinculadas')` |
| removido_em (nova) | timestamptz | sim | remoção **lógica** (§1.8); CHECK `removido_em IS NULL OR removido_em >= criado_em` |
| atualizado_em (nova) | timestamptz | não | CHECK `atualizado_em >= criado_em`; backfill = `criado_em` |

- **Perfil por membro (um por usuário e empresa) [opinião]**, não por vínculo de obra: a SPEC-02 diz "engenheiro pode ter várias obras" sem pedir perfil diferente por obra. Perfil por obra é mais flexível e bem mais caro (RLS e matriz dependem do par); se a obra real exigir, vira `acesso_obra.perfil` em migração futura. **Q1.**
- **Por que `escopo_obras` existe [opinião, ponto central do desenho]:** o banco precisa saber *quais obras* o membro enxerga; se a política citasse os 7 nomes de perfil, a matriz ficaria duplicada (código e política) e divergiria. O CHECK do par perfil x escopo é pequeno, estável e testado contra o enum do código. O banco conhece **um único perfil pelo nome: `administrador`** (trilha da empresa, escrita de membros, convites e carteiras); os outros seis só aparecem pelo escopo. A matriz perfil x ação (quem aprova, quem altera linha de base) fica **na aplicação**, como o plano pede ("tabela em código").
- **"Seed de perfis":** nenhum. Perfil é `text` + CHECK, sem tabela `perfil`. Tabela com FK exigiria semente em migração (nova exceção ao ADR) sem ganho: a matriz é código. Teste garante CHECK = enum C# (T7).
- **UPDATE por coluna [prática, https://www.postgresql.org/docs/current/sql-grant.html]:** hoje `membro_empresa` tem `REVOKE UPDATE, DELETE`. Conceder **só** `GRANT UPDATE (perfil, escopo_obras, removido_em, atualizado_em)`; `empresa_id`, `usuario_id`, `criado_em` ficam imutáveis. `DELETE` segue revogado. O EF gera UPDATE só das colunas alteradas (conferir).
- **Último administrador [opinião]:** nenhuma empresa pode ficar sem administrador ativo. Gatilho de restrição `AFTER INSERT OR UPDATE ON membro_empresa DEFERRABLE INITIALLY DEFERRED FOR EACH ROW` que, ao fim da transação, toma `pg_advisory_xact_lock(hashtextextended(empresa_id::text, 0))` e confere se existe administrador ativo da empresa. Sem o lock, dois administradores que se rebaixam ao mesmo tempo passam (READ COMMITTED: cada um ainda vê o outro como administrador). Diferido para permitir "promover B e rebaixar A" na mesma transação. Docs: https://www.postgresql.org/docs/current/sql-createtrigger.html e https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS. Função com `SET search_path = pg_catalog` e `ENABLE ALWAYS`, como as do 00013. O gatilho lê `membro_empresa` sob o RLS do chamador: o administrador enxerga a própria empresa (`empresa_id = E`). Teste com concorrência (T8).

### 1.2 `acesso_obra` (vínculo usuário x obra)

| Coluna | Tipo | Nulo | Constraint / observação |
|---|---|---|---|
| id | uuid | não | PK `pk_acesso_obra`, v7 (id substituto para a trilha) |
| empresa_id | uuid | não | `IDadoDeEmpresa`; RLS |
| obra_id | uuid | não | FK composta `fk_acesso_obra_obra (empresa_id, obra_id)` → obra(empresa_id, id) |
| usuario_id | uuid | não | FK composta `fk_acesso_obra_membro (empresa_id, usuario_id)` → membro_empresa(empresa_id, usuario_id) |
| criado_em | timestamptz | não | UTC |
| (único) | | | UNIQUE `ux_acesso_obra_obra_usuario (obra_id, usuario_id)`: alvo das FKs de `acesso_frente` |

- Quem concedeu fica **na trilha** (`auditoria.usuario_id`), não em coluna.
- Concessão a membro removido ou de escopo `todas`/`carteiras` é inerte (a política só olha vínculo de escopo `vinculadas`); a aplicação recusa com 400. Não vira CHECK (CHECK não enxerga outra tabela).
- Revogar = **DELETE físico** do vínculo, com trilha (`acao = 'remover'`, §1.7). DELETE concedido **só** nas tabelas de vínculo. **[opinião]** `revogado_em` complicaria PK/UNIQUE, a política e o "conceder de novo".

### 1.3 `frente` e `acesso_frente` (RF-01.1c, RF-02.3a)

`frente`: `id uuid PK` v7; `empresa_id`; `obra_id` (FK composta `(empresa_id, obra_id)` → obra); `nome text` CHECK 1..200; `responsavel_id uuid` nulo (FK composta `(empresa_id, responsavel_id)` → membro_empresa; a remoção lógica não a quebra, a aplicação exige reatribuir antes, como `obra.responsavel_id`); `versao bigint DEFAULT 1` com gatilho (padrão do `trg_obra_versao`; função genérica nova `cronoai.incrementa_versao()`, sem tocar a da obra); `criada_em`, `atualizada_em`, `arquivada_em` com CHECKs de ordem. Únicos: `ux_frente_empresa_obra_id (empresa_id, obra_id, id)` (alvo da FK de `acesso_frente` e das tabelas do 00015) e índice único parcial `(obra_id, lower(nome)) WHERE arquivada_em IS NULL` (SQL cru, como `ux_obra_empresa_nome_ativa`).

`acesso_frente`: `id uuid PK`, `empresa_id`, `obra_id`, `frente_id`, `usuario_id`, `criado_em`;
- FK `(empresa_id, obra_id, frente_id)` → frente(empresa_id, obra_id, id): garante que `obra_id` bate com a frente;
- FK `(obra_id, usuario_id)` → acesso_obra(obra_id, usuario_id): **quem tem frente tem a obra**; revogar a obra exige apagar antes os vínculos de frente (a aplicação faz na mesma transação; o `Restrict` impede esquecer);
- UNIQUE `(frente_id, usuario_id)`.
- **Nesta etapa a frente não filtra nenhum dado** (tarefa é 00015, relato é 00018). Está provado **o vínculo**, não o filtro de dado; o RLS por frente nasce com as tabelas filhas (§2.4). O plano deve dizer isso para o critério "encarregado só vê as suas frentes" não ser dado como cumprido no 00014.

### 1.4 Carteiras (RF-14.8)

- `carteira`: `id uuid PK`, `empresa_id`, `nome text` (1..200), `tipo text` CHECK `IN ('regional','cliente','gestor')`, `versao`, `criada_em`, `atualizada_em`, `arquivada_em`; UNIQUE `(empresa_id, id)`; índice único parcial `(empresa_id, tipo, lower(nome)) WHERE arquivada_em IS NULL`.
- `carteira_obra`: `id uuid PK`, `empresa_id`, `carteira_id`, `obra_id`; FKs compostas `(empresa_id, carteira_id)` → carteira e `(empresa_id, obra_id)` → obra; UNIQUE `(carteira_id, obra_id)`.
- `acesso_carteira`: `id uuid PK`, `empresa_id`, `carteira_id`, `usuario_id`; FKs compostas para carteira e membro; UNIQUE `(carteira_id, usuario_id)`.
- **Obra em várias carteiras (N:N) [opinião]:** uma obra tem uma regional **e** um cliente. Se o produto quiser "no máximo uma por tipo": `tipo` desnormalizado em `carteira_obra` + UNIQUE `(obra_id, tipo)` + FK `(carteira_id, tipo)` (precisa de UNIQUE `(carteira_id, tipo)`). **Q4.**
- Carteira **arquivada não concede acesso** [opinião]; a política junta `carteira` e filtra `arquivada_em IS NULL` (Q4).
- "Gestor" como tipo é só rótulo; quem enxerga o quê vem de `acesso_carteira`, nunca do tipo.

### 1.5 `convite_membro` (E4: convite que vira vínculo no 1º login)

| Coluna | Tipo | Nulo | Constraint / observação |
|---|---|---|---|
| id | uuid | não | PK v7 |
| empresa_id | uuid | não | RLS |
| perfil, escopo_obras | text | não | mesmos CHECKs do membro (copiados para o vínculo no aceite) |
| token_hash | bytea | não | `sha256` de token CSPRNG de 32 bytes; CHECK `octet_length(token_hash) = 32`; UNIQUE `ux_convite_token_hash` |
| criado_por | uuid | não | FK composta `(empresa_id, criado_por)` → membro_empresa |
| criado_em / expira_em | timestamptz | não | CHECK `expira_em > criado_em`; prazo máximo (ex.: 7 dias) na aplicação |
| consumido_em / consumido_por | timestamptz / uuid | sim | CHECK `(consumido_em IS NULL) = (consumido_por IS NULL)`; FK `consumido_por` → usuario(id) |
| revogado_em | timestamptz | sim | |

- **Token, não e-mail [opinião, recomendado]:** o convite carrega um **segredo de uso único** (link); o e-mail é só o canal de entrega e **não é guardado**. Casar pelo e-mail do token OIDC exigiria guardar e-mail (dado pessoal, contra a minimização do 00012) e confiar em `email_verified` do provedor (risco de tomada de conta se o provedor não o garantir; ASVS, https://owasp.org/www-project-application-security-verification-standard/). Se o usuário preferir casar por e-mail: guardar só `HMAC-SHA256(chave do servidor, e-mail normalizado)` e exigir `email_verified = true`; **decisão da Segurança** (Q6). O envio real do e-mail depende de provedor aprovado (Segurança/Infra); sem provedor, a API devolve o link ao administrador **uma única vez** (nunca guarda o token).
- Token por CSPRNG (`RandomNumberGenerator`), 256 bits, e o banco guarda só o hash (vazamento do banco não entrega convite válido). Referência por analogia: OWASP Forgot Password Cheat Sheet, https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Aceite concorrente: `UPDATE ... SET consumido_em, consumido_por WHERE consumido_em IS NULL AND revogado_em IS NULL AND expira_em > :agora` afeta 1 linha para um e 0 para o outro (READ COMMITTED reavalia o WHERE); o perdedor recebe resposta genérica (T12).
- Mensagem **única** para token inválido, expirado, revogado ou já usado (não vira oráculo).

### 1.6 Índices (app DB)

- Já cobertos por PK/UNIQUE: `membro_empresa (empresa_id, usuario_id)`; `acesso_obra (obra_id, usuario_id)` (política "o vínculo desta obra"); `ux_obra_empresa_id_id`.
- Novos: `ix_acesso_obra_usuario (usuario_id, obra_id)` (minhas obras; subconsulta não correlacionada da política); `ix_acesso_obra_empresa_obra (empresa_id, obra_id)` (FK composta pelo lado referenciador); `ix_acesso_frente_usuario (usuario_id, frente_id)`; `ix_frente_empresa_obra (empresa_id, obra_id)`; `ix_carteira_obra_obra (obra_id, carteira_id)`; `ix_acesso_carteira_usuario (usuario_id, carteira_id)`; `ix_convite_empresa_criado (empresa_id, criado_em DESC)` (lista do administrador).
- FKs compostas: o EF cria índice no lado referenciador; **conferir** quais já são cobertos e remover duplicados (padrão do parecer 00013 §1.3).
- Sem índice além do UNIQUE em `token_hash`; sem GIN; volume de dezenas a centenas de linhas por empresa. Medir antes de qualquer outro.

### 1.7 Trilha: o que muda em `auditoria` e quem fica auditável

- `membro_empresa`, `acesso_obra`, `frente`, `acesso_frente`, `carteira`, `carteira_obra`, `acesso_carteira`, `convite_membro` viram `IAuditavel` (o ADR 00006 já previa esvaziar a lista de exceções; `Sessao` e `Empresa` seguem exceção declarada).
- **`entidade_id` (uuid):** vínculos e carteiras têm `id` substituto. `membro_empresa` é a exceção: gravar `entidade_id = usuario_id` com `entidade = 'membro_empresa'` (único dentro da `empresa_id` da linha de trilha) e estender o contrato do interceptor (`EntidadeId` em vez de `Id`). Decisão do arquiteto; a alternativa é `id` substituto em `membro_empresa` (mexe nas FKs de `sessao` e `obra`: **não recomendo**).
- `ck_auditoria_acao`: ampliar de `criar, alterar, arquivar, restaurar` para incluir `remover` (revogar vínculo, remover membro) e `aceitar` (convite consumido). Trocar perfil = `alterar` com `perfil`/`escopo_obras` em antes/depois. Ampliar CHECK = `DROP CONSTRAINT` + `ADD CONSTRAINT` na migração (alerta R19 por citar `auditoria`: esperado, revisão humana).
- `AuditoriaInterceptor` hoje lança em `Deleted`. Para `acesso_*` e `carteira_obra`, estender: `Deleted` de entidade marcada como "vínculo" grava `acao = 'remover'` com `antes` da lista branca; as demais (obra, frente, carteira, membro) seguem sem DELETE físico.
- `obra_id` da linha de trilha: `acesso_obra`, `acesso_frente` e `frente` gravam a obra; `membro_empresa`, `carteira*` e `convite_membro` gravam `NULL` (trilha da empresa: só administrador lê, §2.3).
- **Lista branca por entidade** (`ListaBrancaAuditoria`): `perfil`, `escopo_obras`, `removido_em`, ids; **nunca** `token_hash`, nome ou e-mail. O teste de arquitetura existente reprova entidade nova sem lista.

### 1.8 Remoção de membro: lógica (`removido_em`), não DELETE [opinião, recomendado]

O 00012/ADR 00006 deixaram duas armadilhas: (a) a FK composta `sessao → membro_empresa` é `Restrict` e a política de `sessao` por `usuario_id` impede o administrador de tocar nas sessões de outro usuário; (b) `obra.responsavel_id`, `frente.responsavel_id`, `acesso_*` e `auditoria.usuario_id` também apontam para membro/usuário. **A remoção lógica resolve (a) sem mexer em `sessao`:** `ValidarSessaoAsync` já confere "vínculo vigente" (`EXISTS membro`); passa a exigir `removido_em IS NULL` (e `MinhasEmpresasAsync` idem), e a sessão do removido deixa de valer **na próxima requisição**, sem UPDATE em sessão alheia. Ressalvas:
- Todas as políticas e consultas que leem `membro_empresa` precisam do filtro `removido_em IS NULL` (empresa_select, obra, usuario, convite). Esquecer um mantém acesso: T9 prova cada ponto, com controle negativo.
- Pedido de exclusão do titular (LGPD) não é atendido por `removido_em`; segue com o Jurídico (pseudonimização do `usuario`).
- Reativar = limpar `removido_em` (auditado). Convidar de novo quem já foi membro: o aceite faz `UPDATE` do vínculo existente em vez de `INSERT` (PK `(empresa_id, usuario_id)`).
- Remover membro responsável de obra ou frente: a aplicação recusa (409 com a lista) até reatribuir.

## 2. Autorização no banco x na aplicação

### 2.1 Recomendação [opinião, apoiada em boa prática]

**As duas camadas, com divisão clara:**
- **Banco (RLS): visibilidade.** "Este usuário enxerga esta obra" (e, depois, tarefa, relato etc. da obra) e "só administrador lê a trilha da empresa e gere membros". É o que a SPEC-02 RF-02.3 e o critério "sem vínculo, também sem passar pela UI" pedem, e é a rede contra **filtro esquecido** (mesmo argumento do ADR 00006 para empresa). Defesa em profundidade e privilégio mínimo: OWASP ASVS (https://owasp.org/www-project-application-security-verification-standard/) e IDOR Prevention Cheat Sheet (https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html).
- **Aplicação: ação.** A matriz perfil x ação (quem aprova, quem altera linha de base, quem edita custo) em tabela de código + política de autorização do ASP.NET Core (https://learn.microsoft.com/aspnet/core/security/authorization/policies). O banco **não** replica a matriz (divergiria; não é regra de visibilidade).
- **O que o banco NÃO garante** (escrever no ADR 00006): a variável de sessão não é segredo; quem executa SQL livre com a credencial de `cronoai_app` escolhe empresa **e usuário**. O RLS por obra protege contra erro de código, não contra esse atacante. Jobs sem usuário no contexto (00022/00023) enxergam **zero obras** (falha fechada): precisam de decisão própria nesses ciclos.

**Só aplicação (sem RLS por obra)** seria mais simples, mas cada consulta futura (tarefa, relato, snapshot, EVM, portfólio) teria de lembrar o filtro; um esquecimento vaza dado de obra para quem não tem vínculo, dentro da mesma empresa, **onde o filtro de empresa e o RLS atual não ajudam**. Hoje só `obra` e `auditoria` existem: o custo de fazer certo agora é baixo e o padrão nasce antes do 00015.

### 2.2 Políticas propostas (todas `TO cronoai_app`, por comando, `WITH CHECK` explícito; `U` e `E` = subconsultas escalares existentes)

Predicado de visibilidade da obra, com **subconsultas não correlacionadas** (o planner as avalia uma vez: InitPlan ou hashed SubPlan [prática, https://www.postgresql.org/docs/current/using-explain.html]; **conferir** por `EXPLAIN`):

```
-- pol_obra_select (USING)
empresa_id = E AND (
     EXISTS (SELECT 1 FROM cronoai.membro_empresa m
              WHERE m.empresa_id = E AND m.usuario_id = U AND m.removido_em IS NULL AND m.escopo_obras = 'todas')
  OR id IN (SELECT a.obra_id FROM cronoai.acesso_obra a
              JOIN cronoai.membro_empresa m ON m.empresa_id = a.empresa_id AND m.usuario_id = a.usuario_id
             WHERE a.empresa_id = E AND a.usuario_id = U AND m.removido_em IS NULL AND m.escopo_obras = 'vinculadas')
  OR id IN (SELECT co.obra_id FROM cronoai.carteira_obra co
              JOIN cronoai.carteira c ON c.empresa_id = co.empresa_id AND c.id = co.carteira_id AND c.arquivada_em IS NULL
              JOIN cronoai.acesso_carteira ac ON ac.empresa_id = c.empresa_id AND ac.carteira_id = c.id
              JOIN cronoai.membro_empresa m ON m.empresa_id = ac.empresa_id AND m.usuario_id = ac.usuario_id
             WHERE co.empresa_id = E AND ac.usuario_id = U AND m.removido_em IS NULL AND m.escopo_obras = 'carteiras'))
-- pol_obra_update: USING (mesmo predicado) WITH CHECK (empresa_id = E AND mesmo predicado)
-- pol_obra_insert: WITH CHECK (empresa_id = E AND EXISTS (... escopo_obras = 'todas'))
```

- **Sem recursão [prática]:** obra → {membro, acesso_obra, carteira_obra, carteira, acesso_carteira}; nenhuma dessas políticas cita `obra`. O PostgreSQL recusa dependência circular (42P17); T11 consulta todas as tabelas sob todos os contextos. Regra para o futuro: política de tabela de vínculo **nunca** consulta `obra`.
- **INSERT de obra só para escopo `todas`** (consequência do item 7 de §0: o `RETURNING` exige enxergar a linha nova). Bate com a SPEC (administrador cria obras); a aplicação responde 403 antes, para o 42501 nunca virar 500.
- Tabelas novas (SELECT): `empresa_id = E` e (`usuario_id = U` **ou** administrador/escopo amplo); `frente` e `carteira_obra`: obra visível pelo mesmo predicado. **INSERT/UPDATE/DELETE de `acesso_*`, `carteira*`, `convite_membro` e UPDATE de `membro_empresa`: `empresa_id = E` e administrador ativo** (`EXISTS (SELECT 1 FROM membro_empresa WHERE empresa_id = E AND usuario_id = U AND perfil = 'administrador' AND removido_em IS NULL)`). A RF-14.8 diz que o **gestor de portfólio atribui obras e frentes a engenheiros**: se confirmado, a escrita de `acesso_obra` e `acesso_frente` aceita também `gestor_portfolio` (segundo perfil citado pelo nome no banco). **Q3.**
- `membro_empresa`: SELECT mantém `usuario_id = U OR empresa_id = E`, com `removido_em IS NULL OR usuario_id = U`; INSERT só pelo caminho do convite (§3.3); UPDATE por administrador.
- `empresa`: SELECT passa a exigir `m.removido_em IS NULL` no `EXISTS` (senão o removido segue vendo a empresa).
- **A política atual `pol_membro_empresa_insert (empresa_id = E)` deixa de valer:** hoje qualquer contexto com `E` cria vínculo para **qualquer** `usuario_id`; com perfis isso é escalada de privilégio. Passa a exigir convite válido e `usuario_id = U` (§3.3).

### 2.3 Trilha de auditoria: quem lê o quê (pendência "o motivo dos outros")

Hoje: `pol_auditoria_select USING (empresa_id = E)`: **qualquer** membro lê toda a trilha da empresa, inclusive `motivo` (texto livre, pode conter dado pessoal) e `antes/depois` de custos de obras que não enxerga. Proposta:

```
-- pol_auditoria_select (USING)
empresa_id = E AND (
     (obra_id IS NULL AND EXISTS (administrador ativo de E))              -- trilha da empresa: membros, carteiras, convites
  OR (obra_id IS NOT NULL AND obra_id IN (SELECT id FROM cronoai.obra)) ) -- a subconsulta passa pelo RLS da obra
-- pol_auditoria_insert (WITH CHECK)
empresa_id = E AND usuario_id = U AND (obra_id IS NULL OR obra_id IN (SELECT id FROM cronoai.obra))
```

| Quem | Trilha de uma obra | Trilha da empresa (`obra_id` nulo) | Exportação CSV |
|---|---|---|---|
| administrador | todas as obras | sim | sim |
| gestor de portfólio, diretoria | só obras do escopo (todas ou carteiras) | não | decisão (Q5); recomendo só administrador |
| engenheiros, suprimentos | só obras vinculadas, **se a matriz permitir ler a trilha** (aplicação) | não | não |
| encarregado | não (a matriz da aplicação nega; o banco só garante a visibilidade da obra) | não | não |

- **Visibilidade no banco, permissão de chamar o endpoint na aplicação:** o banco sozinho **não** impede o encarregado de ler a trilha de uma obra que ele enxerga; a política de autorização do endpoint é obrigatória e testada (T16). Se o usuário quiser o banco impedindo também, `pol_auditoria_select` ganha uma condição de escopo/perfil, o que replica a matriz: **não recomendo**.
- `INSERT ... usuario_id = U` **fecha uma lacuna que existe hoje**: pelo `WITH CHECK (empresa_id = E)`, quem tem o papel e um contexto de empresa grava trilha atribuída a **outro** usuário. O interceptor já preenche `usuario_id` do contexto; a política passa a garantir.
- Obra **arquivada** segue visível na trilha (a política não filtra `arquivada_em`).
- Append-only (três camadas) **inalterado**: só SELECT e INSERT, `REVOKE UPDATE, DELETE, TRUNCATE`, gatilho de instrução `ENABLE ALWAYS`. A migração substitui `pol_auditoria_select` e `pol_auditoria_insert` (DROP + CREATE): dispara o alerta R19 (esperado); a revisão humana confirma as três camadas e o catálogo (T13).
- `motivo` de outros: quem não enxerga a obra não lê o motivo; quem enxerga e pode ler a trilha lê (é o propósito dela). Alternativa de minimização [opinião, Q5]: a aplicação omite `motivo` de quem não é administrador nem autor; o banco não faz isso (política é por linha, não por coluna).

### 2.4 Padrão para as tabelas filhas (00015 em diante) e custo

- **Tabela com `obra_id`:** `empresa_id = E AND obra_id IN (SELECT id FROM cronoai.obra)`. A subconsulta é **não correlacionada**, passa pelo RLS da obra e vira `hashed SubPlan` executado uma vez por consulta. **Não** usar `EXISTS (SELECT 1 FROM obra o WHERE o.id = tarefa.obra_id)` (correlacionado: roda a subconsulta, com todo o predicado da obra, **por linha**) nem função `plpgsql` ou com `SET search_path` por linha (não é inlinada). Isto é **estimativa de planner, não medição**: conferir com `EXPLAIN (ANALYZE)` numa tabela sintética de 6.000 linhas antes do 00015 (RNF-01.1: leitura p95 < 300 ms). Sugiro o teste informativo T17 já no 00014 para fixar o padrão.
- **Tabela por frente (relato, apontamento):** obra visível **e** (perfil sem restrição de frente **ou** `frente_id IN (SELECT frente_id FROM acesso_frente WHERE usuario_id = U)`). A regra "perfil restrito por frente" precisa de **uma coluna** (ex.: `membro_empresa.restringe_por_frente boolean`, derivada de perfil = encarregado) para o banco não citar o perfil: decidir no 00018 (cria o relato); **registrar agora no ADR 00006** para o 00014 não modelar de forma incompatível.
- **Custo do predicado de obra** (`pol_obra_select`): 1 `EXISTS` + 2 subconsultas hashed por consulta, cada uma um index scan em tabelas de dezenas a centenas de linhas por empresa: ordem de **sub-milissegundo a poucos ms** [estimativa; medir]. O custo real aparece nas tabelas grandes (00015).
- **Riscos de vazamento do desenho:** (a) esquecer `removido_em IS NULL` em alguma política (T9); (b) política de vínculo citando `obra` (recursão 42P17: T11); (c) variável `app.usuario_id` ausente em job: falha fechada (zero linhas), não vazamento; (d) INSERT que depende de `RETURNING` (item 7 de §0); (e) política afrouxada por engano numa migração futura: teste de predicados **exatos** (T1).

### 2.5 409 `obra-nome-duplicado` revela obra fora do alcance (pendência herdada)

**Fato:** `ux_obra_empresa_nome_ativa (empresa_id, lower(nome)) WHERE arquivada_em IS NULL` é verificado pelo índice, que **ignora o RLS** (como toda unicidade e FK). Com permissão por obra, quem **cria ou renomeia** uma obra e colide com uma obra que **não enxerga** recebe 409: confirma existência e nome de obra alheia (oráculo; um usuário autenticado adivinha nomes). Hoje (todos enxergam tudo) não vaza nada.
Quem dispara: criar obra exige escopo `todas` (política de INSERT), então quem cria **já vê todas** (sem vazamento). **Renomear** é o caso aberto: o engenheiro vinculado a X renomeia X para o nome de Y.
Opções:
1. **[recomendada, opinião]** Editar `nome` (e dados cadastrais: UF, SINAPI) só por quem tem escopo `todas` (administrador; gestor de portfólio se a SPEC admitir): nesses perfis o 409 não revela nada novo. Engenheiro edita o resto da obra, não o nome. Mantém o índice e a regra de produto (Q5 do 00013).
2. Manter a edição de nome para quem tem a obra e responder **genérico** ("nome indisponível") sem ecoar o nome: reduz, mas **não elimina** o oráculo de existência (o 409 em si informa). Aceitável só se o usuário declarar que existência de obra entre colegas não é segredo.
3. Remover a unicidade (RF-14.1 "duplicar obra" já gera nomes iguais): elimina o oráculo; perde a proteção contra cadastro duplicado.
Perguntas Q5 e Q7. O teste T18 fixa a escolha.

### 2.6 403 (SPEC-02) x 404 (ADR 00006)

O critério da SPEC-02 diz "usuário sem vínculo com a obra recebe **403**". Com RLS por obra, a obra sem vínculo **não existe para o usuário**: o caminho natural (carregar antes de atualizar, ADR 00006) devolve **404**, e o ADR 00006 manda 404 para não revelar existência ("o 403 revela que existe"). A RFC 9110 admite 404 para ocultar o recurso (https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4). **[opinião]** Recomendo **404 para obra sem vínculo** (mesma regra da empresa) e **403 para ação não permitida pelo perfil em obra que o usuário enxerga**; o critério da SPEC-02 deve ser emendado ("recebe 403 ou 404, nunca dado"). **Q9** (decisão do usuário; muda o teste de aceite).

## 3. `usuario` sob RLS

### 3.1 É possível agora? Sim, com custo controlado [opinião: recomendo fazer no 00014]

O adiamento do 00012 tinha a condição "quando houver listagem de membros": o 00014 a traz (E4). O que bloqueava era o login (upsert por `(emissor, sujeito)` **antes** de existir `usuario_id`). Solução sem `SECURITY DEFINER` (inviável sob FORCE, §0.4): **variáveis de sessão de login**, no mesmo padrão e rigor das atuais.

### 3.2 Mecanismo

- Duas variáveis novas: `app.login_emissor` e `app.login_sujeito` (texto). O `ContextoSessaoInterceptor` passa a sobrescrever **sempre** as cinco variáveis (`usuario_id`, `empresa_id`, `login_emissor`, `login_sujeito`, `convite_hash`), inclusive vazias, **como parâmetros**, nomes constantes; a guarda `No Reset On Close` e os testes de pool se estendem às novas.
- `ContextoSessaoBanco` ganha o contexto de login (record imutável; `DoLogin(emissor, sujeito)` e `DoConvite(hash)`). O upsert do passo 1 usa `DoLogin`; os demais passos seguem com `DoUsuario`. Nenhum passo posterior muda.
- Nas políticas, `(SELECT NULLIF(current_setting('app.login_emissor', true), ''))`: vazio vira `NULL`, e `emissor = NULL` nunca casa (o CHECK de tamanho já impede `emissor = ''`).

Políticas de `usuario` (todas `TO cronoai_app`, `ENABLE` + `FORCE`):
```
SELECT: id = U
        OR (emissor = LE AND sujeito = LS)                                  -- login
        OR id IN (SELECT m.usuario_id FROM cronoai.membro_empresa m
                   WHERE m.empresa_id = E AND m.removido_em IS NULL)        -- colegas da empresa ativa
INSERT: WITH CHECK (emissor = LE AND sujeito = LS)
UPDATE: USING (id = U OR (emissor = LE AND sujeito = LS)) WITH CHECK (id = U OR (emissor = LE AND sujeito = LS))
sem DELETE (o REVOKE já existe)
```
- `INSERT ... ON CONFLICT (emissor, sujeito) DO UPDATE` exige as políticas de INSERT, SELECT e UPDATE e **erra** (42501, não ignora em silêncio) se a linha existente não passa no `USING` [prática, https://www.postgresql.org/docs/current/sql-createpolicy.html e https://www.postgresql.org/docs/current/sql-insert.html]; como a variável de login é a própria chave, passa. **Conferir** por teste (T11).
- A unicidade `ux_usuario_emissor_sujeito` segue verificada fora do RLS: só o dono da chave dispara o conflito no INSERT.
- **O que o RLS passa a proteger:** `cronoai_app` deixa de ler os usuários de todas as empresas; vê o próprio, o que está logando e os membros ativos da empresa ativa. **Risco residual menor:** o par `emissor + sujeito` dos colegas da **mesma** empresa fica legível por SQL livre sob `E` (RLS é por linha, não por coluna). Se a Segurança considerar inaceitável, a alternativa é **separar** `identidade_externa(usuario_id, emissor, sujeito)` em tabela própria acessível só por `id = U`/login, deixando `usuario(id, nome_exibicao, ...)` listável. Custo: migração de dados com `ExecutarDmlComRls`, upsert em dois passos e mudança de modelo; **não recomendo agora** [opinião]; decisão da Segurança (Q6).
- Consequências no código (para o plano): (a) `SementeDesenvolvimento` e o `DadosTeste` inserem `usuario` sem contexto: passam a usar `DoLogin` (semente) ou o superusuário da fixture (testes de dados); (b) o teste de arquitetura que limita `DbSet<Usuario>` a `ConsultasIdentidade.cs` passa a admitir a consulta de membros (junta `membro_empresa` e `usuario` sob `E`); (c) `ConsultasAuditoria` segue sem JOIN de nome (nome é dado pessoal): a UI resolve o nome em consulta separada, sujeita a este RLS.

### 3.3 Convite sob RLS (mesma técnica)

Sem `SECURITY DEFINER`, o aceite é uma sequência de dois contextos:
1. contexto `DoConvite(hash)`: lê `convite_membro` pelo hash (política de SELECT: `empresa_id = E` e administrador, **ou** `token_hash = decode(NULLIF(current_setting('app.convite_hash', true), ''), 'hex')`) para descobrir `empresa_id` e `perfil`; sem resultado = erro genérico;
2. contexto `(U = usuário do login, E = empresa do convite, convite_hash)`, **numa transação**: `INSERT membro_empresa` (ou `UPDATE` do vínculo removido) e `UPDATE convite_membro SET consumido_em, consumido_por WHERE consumido_em IS NULL ...`.

Política de INSERT de `membro_empresa`: `empresa_id = E AND usuario_id = U AND EXISTS (SELECT 1 FROM convite_membro c WHERE c.empresa_id = membro_empresa.empresa_id AND c.token_hash = <hash do contexto> AND c.consumido_em IS NULL AND c.revogado_em IS NULL AND c.expira_em > now() AND c.perfil = membro_empresa.perfil AND c.escopo_obras = membro_empresa.escopo_obras)`. O `now()` é do relógio do banco; o teste de expiração usa `expira_em` no passado/futuro. Ordem na transação: **INSERT do vínculo antes do UPDATE do convite** (depois do UPDATE a política recusaria). Sem convite válido ninguém cria vínculo pelo papel da aplicação; a semente de desenvolvimento usa o mesmo caminho (convite de dev) ou um DML de migração/semente explícito para o administrador inicial (Q8).

### 3.4 Alternativa descartada
`SECURITY DEFINER` com dono `BYPASSRLS`: proibido pelo projeto (`NOBYPASSRLS` nos dois papéis; ADR 00004 e 00006).

## 4. Migração `PerfisPermissoes`

### 4.1 Up (ordem; uma transação)
1. `ALTER TABLE membro_empresa ADD COLUMN perfil text, ADD COLUMN escopo_obras text, ADD COLUMN removido_em timestamptz, ADD COLUMN atualizado_em timestamptz` (nulas).
2. **Backfill** (tabela com RLS: só por `ExecutarDmlComRls`, chamada e SQL na mesma linha, R15): `UPDATE cronoai.membro_empresa SET perfil = 'administrador', escopo_obras = 'todas', atualizado_em = criado_em WHERE perfil IS NULL`.
3. `SET NOT NULL` em `perfil`, `escopo_obras`, `atualizado_em`; CHECKs `ck_membro_perfil`, `ck_membro_escopo`, `ck_membro_perfil_escopo`, `ck_membro_removido_apos_criado`, `ck_membro_atualizado_apos_criado`. Com dado real, `NOT VALID` + `VALIDATE` separado reduz o lock; o momento é da Infraestrutura.
4. `CREATE TABLE` das sete tabelas novas (§1.2 a §1.5), índices (§1.6), gatilhos de versão (`frente`, `carteira`) e o **gatilho de restrição do último administrador** (§1.1), com `ENABLE ALWAYS`.
5. Privilégios (o default do `Inicial` concede DML geral): `GRANT UPDATE (perfil, escopo_obras, removido_em, atualizado_em) ON membro_empresa`; `REVOKE DELETE` em `frente`, `carteira`, `convite_membro`; DELETE **só** em `acesso_obra`, `acesso_frente`, `carteira_obra`, `acesso_carteira`; em `convite_membro`, `REVOKE UPDATE` e `GRANT UPDATE (consumido_em, consumido_por, revogado_em)`.
6. `ENABLE` + `FORCE` e políticas **por comando** nas tabelas novas; `ALTER TABLE usuario ENABLE/FORCE` + 3 políticas (§3.2); **substituição** (`DROP POLICY` + `CREATE POLICY` por helper) de `pol_empresa_select`, `pol_membro_empresa_select/insert`, `pol_obra_select/insert/update`, `pol_auditoria_select/insert`; nova `pol_membro_empresa_update`.
7. `ck_auditoria_acao` ampliado (§1.7).
8. Conferência final na própria migração (`DO` com `RAISE EXCEPTION`): nenhum `membro_empresa` com `perfil` nulo; `auditoria` com **exatamente** as políticas SELECT e INSERT e o gatilho `tgenabled = 'A'`.

### 4.2 Quem vira administrador
**[opinião]** Todo membro existente vira `administrador` com escopo `todas`. Razões: (1) hoje só existem membros criados pela **semente de desenvolvimento** (§0.1) e o comportamento do 00012/00013 é "todos fazem tudo"; (2) evita ficar sem administrador; (3) preserva testes e e2e atuais. **Risco:** se algum ambiente já tiver membros reais, promover todos é concessão ampla. Antes de aplicar fora do ambiente local, **a Infraestrutura confere** `SELECT empresa_id, count(*) FROM membro_empresa GROUP BY 1`. Regra alternativa: só o membro mais antigo por empresa vira administrador e os demais viram `diretoria` com escopo `todas` (leitura, sem perda de visibilidade). **Q10.**
Nenhum seed de perfis e nenhum `acesso_obra` sai da migração; a semente de desenvolvimento (comando explícito, ADR 00004) é atualizada para criar perfis diferentes e obras vinculadas, para o e2e e a demonstração.

### 4.3 Índice parcial `WHERE empresa_ativa_id IS NOT NULL` (pendência herdada)
Decisão **[opinião, com fundamento]: não fazer; manter o índice completo `ix_sessao_empresa_ativa_id_usuario_id`.**
- Ele só serve à **checagem da FK composta pelo lado referenciador** (apagar ou mudar a PK de `membro_empresa`), e a aplicação **nunca** faz isso (sem DELETE; remoção é lógica, §1.8). Logo é quase ocioso; trocá-lo por parcial economiza só as linhas com `empresa_ativa_id` nulo (sessões antes de escolher empresa, curtas, limpas no login) e custa DROP + CREATE sem benefício mensurável.
- Se um dia for útil (consulta "sessões ativas da empresa X" no 00023), o parcial `(empresa_ativa_id, usuario_id) WHERE empresa_ativa_id IS NOT NULL` é válido: o predicado é implicado por qualquer cláusula de operador estrito na coluna (`= $1`) [prática, https://www.postgresql.org/docs/current/indexes-partial.html; **conferir** com `EXPLAIN` da consulta real e do plano genérico da FK].
- Fechar a pendência no ADR 00006 e no ciclo como "avaliado, mantido".

### 4.4 Helper `PoliticaUpdate("auditoria")` e a R19 (pendência herdada)
A R19 procura o texto `CREATE POLICY` etc. na migração; os helpers escondem o SQL, então `PoliticaUpdate("auditoria", ...)` não contém a palavra. Medidas, a primeira é a que de fato fecha:
1. **Guarda no próprio helper** (`MigrationBuilderRlsExtensoes`): `PoliticaUpdate` e `PoliticaDelete` lançam `ArgumentException` quando `tabela == "auditoria"` (mesmo padrão da guarda de 63 bytes). Falha ao gerar a migração, sem depender de regex nem de revisor. Teste unitário com controle negativo (outra tabela passa).
2. **R19 ampliada** (alerta): citar `Politica(Select|Insert|Update|Delete)\(\s*"auditoria"` e o novo helper de substituição; casos novos em `regras-cronoai.test.mjs`. O 00014 dispara esse alerta de propósito; o PR registra "R19 alertou, conferido: três camadas intactas (T13)".
3. O **teste de catálogo com predicados exatos** segue sendo a garantia real (R19 é alerta). A lista de políticas e `Predicados_das_politicas_sao_os_do_plano` precisam ser **atualizados na mesma migração** com o texto que o PostgreSQL de fato devolve em `pg_policies` (espaços normalizados): copiar da saída real, nunca escrever à mão.

### 4.5 Down
Reversão **estrutural**, com perda dos dados novos (aceitável: sem produção; declarar no PR): `DROP` das sete tabelas (ordem inversa das FKs), do gatilho e função do último administrador e da função genérica de versão; `DROP COLUMN` das quatro colunas (e CHECKs); `REVOKE UPDATE (colunas)`; `ALTER TABLE usuario DISABLE ROW LEVEL SECURITY` e `DROP POLICY` das três; **restaurar os predicados anteriores** (cópia literal das migrações `IdentidadeEmpresas` e `ObrasAuditoria`) de empresa, membro, obra e auditoria; restaurar `ck_auditoria_acao`. Teste: `Up → Down → Up` e, após o `Down`, o `pg_policies` **idêntico** ao golden do 00013 (T15); sem isso o `Down` restauraria política errada em silêncio. Sem `CASCADE` (R19). Em produção o `Down` não se aplica.

## 5. Testes de banco obrigatórios (Testcontainers, `BancoPostgresFixture`; como `cronoai_app`, contextos pela fábrica; superusuário só para semear e para o controle)

Cenário-base: empresas X e Y. Em X: A (administrador, `todas`), B (engenheiro, `vinculadas` à obra1), C (gestor, `carteiras`, com acesso à carteira que contém a obra2), D (engenheiro sem vínculo), R (engenheiro vinculado, depois removido), F (encarregado vinculado à obra1 e à frente1). Em Y: Z (administrador). Obras: obra1, obra2, obra3 (X) e obraY.
Lição aplicada: negativos de UPDATE/DELETE **sem `WHERE` e sem `RETURNING`** (e sem ler coluna no `SET`: constante), para a política de SELECT não mascarar um `USING`/`WITH CHECK` afrouxado; **predicados exatos** de `pg_policies`; controle por mutação (afrouxar a política numa transação revertida e ver o teste falhar).

| # | Teste | Verifica | Controle negativo |
|---|---|---|---|
| T1 | `Catalogo_politicas_e_predicados_exatos` | lista `tabela\|cmd\|roles\|permissive` e **texto exato** (normalizado) de USING e WITH CHECK de **todas** as políticas (novas e substituídas); nenhuma política de UPDATE/DELETE em `auditoria`; nenhuma para o migrador | mutação: numa transação revertida, `ALTER POLICY pol_obra_select ... USING (true)` e `pol_auditoria_insert WITH CHECK (true)`; o mesmo comparador **falha** |
| T2 | `Obra_visivel_por_escopo` | obras visíveis: A = {1,2,3}; B = {1}; C = {2}; D = {}; R (removido) = {}; Z = {obraY}; sem contexto = {} | superusuário vê as 4; A com `removido_em` preenchido vê {} |
| T3 | `Obra_update_fora_do_alcance_nao_altera` | como B, `UPDATE cronoai.obra SET atualizada_em = '2030-01-01T00:00:00Z'` (**sem WHERE, sem RETURNING, constante**) afeta 1 linha; obra2 e obra3 intactas (conferir como superusuário); trocar `empresa_id` para Y: 42501 | como A o mesmo comando afeta 3; mutação da `WITH CHECK` faz o teste falhar |
| T4 | `Obra_insert_so_para_escopo_todas` | B e C: INSERT de obra = 42501; A: ok com `RETURNING` | A inserindo com `empresa_id = Y` = 42501 |
| T5 | `AcessoObra_rls_e_escrita` | B lê só os próprios vínculos; A lê todos; INSERT por não administrador = 42501; `DELETE FROM cronoai.acesso_obra` **sem WHERE** por não administrador afeta 0 e tudo permanece (superusuário conta); `empresa_id <> E` = 42501 | A apaga um vínculo: afeta 1; mutação da política de DELETE falha o teste |
| T6 | `FKs_compostas_por_empresa` | `acesso_obra` com membro ou obra de outra empresa; `acesso_frente` sem `acesso_obra` do usuário; `acesso_frente` com `obra_id` diferente da frente; `carteira_obra` cruzando empresas; `frente.responsavel_id` de outra empresa: todos 23503 (mesmo código para "inexistente" e "de outra empresa"); revogar `acesso_obra` com `acesso_frente` pendente: 23503 | o caso válido de cada um passa; `Fks_do_schema_sao_restrict` e `Identificadores_cabem_em_63_bytes` estendidos |
| T7 | `Membro_perfil_escopo_checks` | perfil desconhecido, escopo inválido e pares proibidos (engenheiro com `todas`; administrador com `vinculadas`) = 23514; **valores do CHECK = enum C#** (lê `pg_get_constraintdef` e compara com `Enum.GetNames`) | pares válidos passam; enum com valor a mais no código reprova o teste |
| T8 | `Ultimo_administrador` | rebaixar ou remover o último administrador falha ao `COMMIT`; com dois, rebaixar um passa; promover B e rebaixar A na mesma transação passa (diferido); **concorrência:** dois administradores se rebaixando em paralelo (`Task.WhenAll`): um sucesso e a empresa mantém 1 administrador | sequencial com 2 administradores passa até sobrar 1; `tgenabled = 'A'` no catálogo |
| T9 | `Remocao_logica_nega_acesso_em_todos_os_pontos` | após `removido_em`: obra invisível, `ValidarSessaoAsync` nulo, `MinhasEmpresasAsync` sem a empresa, `empresa` invisível, colegas em `usuario` invisíveis, `acesso_obra` inerte; **uma asserção por ponto** | antes da remoção os mesmos pontos devolvem acesso |
| T10 | `Privilegios_por_tabela_e_coluna` | `has_column_privilege` em `membro_empresa`: UPDATE verdadeiro só em `perfil`, `escopo_obras`, `removido_em`, `atualizado_em`; falso em `empresa_id`, `usuario_id`, `criado_em`; sem DELETE em membro, obra, frente, carteira, convite, usuario, auditoria; DELETE só nas quatro tabelas de vínculo; `convite_membro` UPDATE só nas três colunas; `auditoria` só SELECT/INSERT; sem TRUNCATE/TRIGGER/REFERENCES em nenhuma | a mesma consulta num privilégio **concedido** (`obra.UPDATE`) é verdadeira |
| T11 | `Usuario_rls` | sem contexto: 0 linhas; `U`: só a própria; `E`: os membros **ativos** da empresa ativa e não os da outra; **login:** upsert com `DoLogin(emissor, sujeito)` cria e, no 2º, atualiza o **mesmo** id; variável de login vazia não casa nada; INSERT com chave diferente da variável = 42501; `ON CONFLICT DO UPDATE` sobre a chave de **outro** usuário = 42501 (não ignorado); `UPDATE cronoai.usuario SET ultimo_acesso_em = '2030-01-01'` (sem WHERE, sem RETURNING) sob `U` afeta 1 linha e as outras ficam intactas; **sem recursão:** `SELECT` em todas as tabelas sob todos os contextos sem 42P17; `PoolRlsTestes` estendido: conexão reciclada não carrega login nem convite | superusuário vê todos; sobrescrita das 5 variáveis independente do reset do pool |
| T12 | `Convite_aceite_e_abuso` | token certo cria o vínculo com o perfil do convite e consome; token errado, expirado, revogado ou consumido: mesma resposta genérica; INSERT em `membro_empresa` sem convite válido = 42501; com `usuario_id <> U` = 42501; com perfil diferente do convite = 42501; **concorrência:** dois aceites do mesmo convite (`Task.WhenAll`): exatamente 1 sucesso; `token_hash` não vai à trilha (lista branca) | convite válido e não consumido: sucesso; mutação da `WITH CHECK` do INSERT do vínculo falha o teste |
| T13 | `Auditoria_politicas_novas` | B lê a trilha da obra1 e **não** a da obra2; linhas com `obra_id` nulo só para administrador; `SELECT motivo FROM auditoria` sob B nunca devolve motivo de obra fora do alcance; INSERT com `usuario_id <> U` = 42501; INSERT em obra invisível = 42501; append-only intacto (UPDATE/DELETE/TRUNCATE = 42501 e gatilho, `pg_policies` só SELECT e INSERT, `tgenabled = 'A'`; `AppendOnlyTestes` existentes passam sem alteração) | A lê todas, inclusive as de `obra_id` nulo; mutação de `pol_auditoria_insert` falha o teste |
| T14 | `Helper_recusa_politica_de_escrita_na_auditoria` e R19 | `PoliticaUpdate("auditoria", ...)` e `PoliticaDelete("auditoria", ...)` lançam; `node --test`: a R19 alerta migração que usa helper com `"auditoria"` | `PoliticaUpdate("obra", ...)` não lança; migração sem `auditoria` não alerta |
| T15 | `Migracao_up_down_up` | em banco com membros pré-existentes: backfill = todos administradores e `todas`, sem nulos; `Down` deixa `pg_policies` **idêntico** ao golden do 00013 e remove colunas e tabelas; `Up` de novo passa; `has-pending-model-changes` limpo | migração sem o backfill falha no `SET NOT NULL` (prova que o backfill é necessário) |
| T16 | `Matriz_perfil_x_rota` (parametrizado) | para cada perfil x rota (obras, trilha, exportação, membros, convites, carteiras, frentes): 200/403/404 da tabela de código **sem passar pela UI**; `CatalogoRotas` ganha o cenário `ComObraSemVinculo` com `RecursoAlheio` = **obra real da mesma empresa sem vínculo**; encarregado nunca lê a trilha | administrador passa em tudo da empresa; meta-teste confere que o recurso existe e é da mesma empresa (id aleatório não prova nada) |
| T17 | `Politica_por_obra_desempenho_referencia` (informativo, sem limite que reprove) | tabela sintética de 6.000 linhas por obra com o padrão de §2.4: tempo de leitura sob A e sob B; `EXPLAIN` mostra `hashed SubPlan`; números registrados no ciclo | mesma leitura em tabela sem RLS e com o padrão correlacionado (`EXISTS`), para comparar |
| T18 | `Obra_nome_duplicado_conforme_decisao` | o comportamento escolhido em §2.5 (renomear para nome de obra invisível: 403 pela matriz, ou 409 genérico sem ecoar o nome) | criar/renomear com nome livre = 200 |
| T19 | `Semente_e_isolamento_regressao` | a semente cria perfis e vínculos pelos caminhos novos; os testes `Rls_*` de isolamento entre empresas seguem verdes | |
| T20 | `Trilha_de_membros_e_vinculos` | cada operação do E4 (convidar, aceitar, trocar perfil, remover, atribuir e revogar obra e frente, criar e arquivar carteira) grava **uma** linha de trilha na mesma transação, com lista branca, e **nenhuma** em 409 ou erro (atomicidade nos dois sentidos, como T11 e T12 do 00013) | caminho feliz grava 1; entidade nova sem lista branca reprova o teste de arquitetura |

Fora do banco, mas do ciclo: `ArquiteturaTestes` (R16 a R19 seguem válidas; `DbSet<Usuario>` passa a admitir a consulta de membros; `IgnoreQueryFilters` só em `ConsultasIdentidade`); `ExecuteUpdate/ExecuteDelete` seguem proibidos fora dela (vínculos saem pelo `SaveChanges` auditado).

## 6. Riscos e perguntas ao usuário

### 6.1 Riscos
1. **[prática]** Recursão de política (42P17) e `RETURNING` aplicando SELECT: T4 e T11. Doc: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
2. **[prática]** Unicidade e FK ignoram o RLS: oráculos de existência (nome da obra, §2.5; código de erro da FK composta, já aceito no 00012). Mensagem única em convite e vínculo.
3. **[opinião]** Predicados longos em `pg_policies`: o teste de texto exato fica frágil a mudança de deparse. Mitigação: golden da saída real e expressões **só** nos helpers (`Rls/`), nunca copiadas à mão.
4. **[opinião]** Custo do RLS por obra nas tabelas grandes do 00015: sem medição (estimativa). O padrão não correlacionado e o T17 reduzem o risco; **o 00015 mede com 3.000 tarefas e 6.000 vínculos**.
5. **[exigência]** FK `Restrict` em tudo (ADR 00004): revogar acesso ou arquivar exige limpar dependentes na mesma transação; esquecer dá 23503 (mapear para 409).
6. **[opinião]** Variável de sessão não é segredo (ADR 00006): RLS por obra e por usuário **não** contém atacante com SQL livre.
7. **[prática]** Jobs sem usuário no contexto veem zero obras (falha fechada): 00022 e 00023 precisam de decisão própria; **nunca** `BYPASSRLS`.
8. **[exigência/segurança]** Convite: segredo de uso único, hash no banco, expiração, resposta genérica, limite de taxa nos endpoints de convite e aceite (SPEC-12 RF-12.5): `seguranca` valida.
9. **[exigência]** Dados do encarregado (trabalhador): nenhum telefone na Fase 2 (RNF-02.3); nome é dado pessoal. **RH + Jurídico** antes de cadastro real; o parecer deles prevalece.
10. **[opinião]** A estimativa **M** pode subir: RLS em `usuario`, convite por variável de sessão, gatilho do último administrador e interceptor ampliado tocam vários pontos delicados. Se for preciso cortar, o corte mais seguro é **adiar `usuario` sob RLS e o convite** (membro criado só pela semente) e entregar perfis, vínculos, carteiras e RLS por obra; **não** cortar a trilha por visibilidade nem a nova política de INSERT do membro.
11. **[prática]** Pacote ou dependência nova: nenhuma prevista (SHA-256 e CSPRNG são do .NET). Se o envio do convite exigir biblioteca de e-mail, revisão de segurança e de licença antes de produção.

### 6.2 Perguntas ao usuário (com a minha recomendação)
- **Q1. Perfil por membro ou por obra?** Recomendo por membro (§1.1).
- **Q2. "Empreiteiro" (RF-02.3a) é perfil à parte ou o mesmo "encarregado/mestre"? O encarregado faz login OIDC no 00014 ou só vira usuário na Fase 3 (WhatsApp)?** Recomendo o mesmo perfil e, sem login ainda, cadastrar o encarregado só como responsável de frente por **texto livre** até RH e Jurídico liberarem (evita criar `usuario`/`membro` de trabalhador agora; `frente.responsavel_id` fica opcional e entra `responsavel_texto`).
- **Q3. Quem atribui obra e frente a engenheiros: só o administrador ou também o gestor de portfólio (RF-14.8)?** Se também, o banco passa a citar `gestor_portfolio` pelo nome.
- **Q4. Obra em várias carteiras ou no máximo uma por tipo? Carteira arquivada concede acesso?** Recomendo N:N e arquivada sem acesso.
- **Q5. Dados cadastrais da obra (nome, UF, SINAPI) só para quem vê todas as obras? Exportação da trilha só do administrador? `motivo` visível a quem?** Recomendo: nome e cadastro só `todas`; exportação só administrador; `motivo` para quem lê a trilha.
- **Q6. Convite por token (recomendado) ou por e-mail verificado? O par `emissor + sujeito` dos colegas visível sob a empresa ativa é aceitável, ou separamos `identidade_externa`?** Decisão da **Segurança da Informação**.
- **Q7. Manter ou remover a unicidade do nome de obra?** Recomendo manter, com a opção 1 de §2.5.
- **Q8. Como nasce a primeira empresa e o primeiro administrador fora do desenvolvimento?** Hoje não há caminho (§0.1). Recomendo comando administrativo explícito de provisionamento (fora da API, credencial dedicada definida com a **Infraestrutura**), nunca política "empresa vazia pode se auto-reivindicar".
- **Q9. Obra sem vínculo: 404 (recomendado) ou 403 (texto atual da SPEC-02)?** Emendar a SPEC-02 conforme a resposta.
- **Q10. Membros existentes viram todos administradores (aceitável só se forem dados de dev) ou só o mais antigo?** (§4.2)
- **Q11. Jurídico e RH:** `removido_em` basta para o desligamento ou o titular pode pedir pseudonimização do `usuario`? Qual a retenção do convite consumido?

CONHECIMENTO NOVO:
- `SECURITY DEFINER` não contorna `FORCE ROW LEVEL SECURITY` quando o dono é o migrador e as políticas são `TO cronoai_app`: a função enxerga zero linhas. Login e convite sob RLS só funcionam com variáveis de sessão próprias (mesmo padrão e rigor de `app.usuario_id` e `app.empresa_id`), nunca com função definidora.
- `INSERT` com `RETURNING` aplica a política de SELECT à linha nova: quem não enxerga a obra recém-criada tem o INSERT recusado (42501); com RLS por obra, só escopo `todas` cria obra em uma instrução.
- A política atual `pol_membro_empresa_insert (empresa_id = E)` permite criar vínculo para qualquer `usuario_id` (com perfis vira escalada de privilégio) e `pol_auditoria_insert (empresa_id = E)` permite gravar trilha atribuída a outro usuário: exigir `usuario_id = U`.
- Unicidade e FK ignoram o RLS: o 409 `obra-nome-duplicado` é oráculo de existência assim que a visibilidade for por obra.
- Tabelas de vínculo com PK composta quebram `auditoria.entidade_id uuid` e `IAuditavel.Id`: usar `id` substituto (exceção: `membro_empresa`, `entidade_id = usuario_id`). O `AuditoriaInterceptor` lança em `Deleted`: revogar vínculo exige estender o interceptor ou usar soft-delete.
- Hoje nenhum caminho de produção cria `empresa` ou `membro_empresa` (só a semente de dev): o primeiro administrador real é lacuna a decidir com a Infraestrutura.
- O helper `PoliticaUpdate/Delete` deve recusar `auditoria` por guarda no próprio código (a R19 só vê o texto SQL, não as chamadas de helper).
- Subconsulta **não correlacionada** em política (`obra_id IN (SELECT id FROM obra)`) é avaliada uma vez; `EXISTS` correlacionado ou função com `SET search_path` rodam por linha: padrão para as tabelas do 00015 (a confirmar por `EXPLAIN`).
