# Plano da Fase 2 — Multiusuário com backend

| Campo | Valor |
|---|---|
| Status | **Rascunho para o gate do usuário** (ordem dos 13 ciclos e perguntas PF-1 a PF-3) |
| Data | 2026-10-25 |
| Autor | agente `arquiteto` (processo em [.claude/skills/desenvolver-recurso](../../.claude/skills/desenvolver-recurso/SKILL.md)) |
| Base | `master` |
| Origem | Pedido do usuário de 25/10/2026: plano da Fase 2 (SPEC-01, SPEC-02, SPEC-12 parte 2, SPEC-14 Fase 2, SPEC-15 Fase 2 e migração do front do IndexedDB para a API), com as decisões listadas na seção 2. Modelo de formato: [PLANO-FASE-1.md](PLANO-FASE-1.md) |
| Destino | `docs/specs/PLANO-FASE-2.md` (este rascunho foi entregue fora do repositório; a branch atual `feat/00004-motor-minutos-calendarios` não foi tocada) |

## Resumo
- **O que é:** a ordem e o recorte para criar o backend do CronoAI (.NET 10 + PostgreSQL, em `server/`), com login, perfis, trilha de auditoria, várias empresas isoladas entre si, o motor de cálculo portado para C# com paridade comprovada contra o TypeScript, a central de integrações com segredos cifrados e o front Vue passando a ler e gravar pela API. **Tudo em ambiente local.** Hospedagem, deploy, domínio e provedor de nuvem são da **Infraestrutura** e não entram neste plano.
- **Ordem recomendada (13 ciclos):**

| Ciclo | Conteúdo |
|---|---|
| `00011` | Esqueleto do backend (solução, PostgreSQL local, migrações, health check, CI) |
| `00012` | Identidade, empresas e isolamento entre empresas |
| `00013` | Obras no servidor, trilha de auditoria append-only e concorrência otimista |
| `00014` | Perfis, permissões por obra e frente, carteiras e gestão de membros |
| `00015` | Modelo do cronograma no servidor (tarefas, vínculos, calendários, premissas, linhas de base) |
| `00016` | Motor C# parte 1: calendário em minutos e CPM, com paridade |
| `00017` | Motor C# parte 2: EVM, cenários, suprimentos e orçamento SINAPI, com paridade |
| `00018` | Histórico e campo no servidor: snapshots, apontamentos, aprovação e anexos |
| `00019` | Front: sessão, leitura pela API e importação dos dados locais |
| `00020` | Front: escrita pela API, conflito 409 e fim do cálculo no navegador |
| `00021` | Portfólio por empresa e carteiras |
| `00022` | Central de integrações no servidor (conectores, segredos cifrados, webhooks, encaixe do WhatsApp) |
| `00023` | Segurança e operação (SPEC-12 parte 2): fechamento do ASVS nível 2, LGPD, observabilidade, operação local |

- **Por quê:** o que não depende do modelo de domínio (esqueleto, identidade, isolamento, auditoria, perfis) vem primeiro e pode correr **em paralelo ao fim da Fase 1** (arquivos disjuntos: `server/` × `src/`). O modelo do cronograma e o motor C# só entram depois que a Fase 1 estabilizar os modelos no front (a SPEC-01 declara essa dependência: "Depende de SPEC-03, SPEC-04 — modelos validados no front"). O front só troca o IndexedDB pela API quando o servidor tiver todas as entidades, para não haver obra metade local e metade no servidor.
- **Faixas previstas:** todos os ciclos na **faixa 3** (T8: backend, autenticação, banco ou integração; o `classificar-diff.mjs` marca T8 por qualquer arquivo em `server/`).
- **Estimativa relativa (opinião):** M, M/G, M/G, M, G, G, G, M/G, M/G, G, M, M/G, M.
- **O que bloqueia:** nada bloqueia o desenvolvimento **local**. O uso real (piloto, dados de clientes) depende de **Infraestrutura** (hospedagem, banco gerenciado, backup, TLS, guarda da chave de cifra em produção), **Segurança da Informação** (provedor OIDC real e MFA, dependências, catálogo de conectores, desenho da cifra, teste de intrusão) e **Jurídico** (LGPD, termos de uso multiempresa, retenção, licenças, WhatsApp não oficial). Detalhes na seção 11.
- **O que você precisa fazer:** aprovar a ordem e responder PF-1 a PF-3 (seção 13). Em cada ciclo, o gate da etapa 4 continua valendo (plano aprovado antes da implementação). O plano do 1º ciclo está em `00011-backend-esqueleto-plano.md`, entregue junto.

## 1. Escopo da Fase 2

| Spec | Recorte | Requisitos |
|---|---|---|
| SPEC-01 | Backend .NET 10 em `server/`, PostgreSQL local, API REST versionada com OpenAPI no repositório, empresa → obras → usuários, frentes, concorrência otimista, migração do protótipo, motor de cálculo no servidor com paridade | RF-01.1, RF-01.1a, RF-01.1b, RF-01.1c, RF-01.2, RF-01.3 (exceto import/export MS Project: **PF-1**), RF-01.4, RF-01.5; RNF-01.1, RNF-01.3 (API + PostgreSQL; Redis fora), RNF-01.4. Critérios §7: os 4 |
| SPEC-02 | Login OIDC genérico (provedor real com a Segurança) + usuário de desenvolvimento só local, autorização no backend, permissão por obra e por frente, isolamento entre empresas testado em toda rota, auditoria append-only exportável | RF-02.1 (genérico; MFA é do provedor), RF-02.2, RF-02.3, RF-02.3a, RF-02.3b, RF-02.4, RF-02.5; RNF-02.1, RNF-02.2, RNF-02.3. Critérios §6: os 3 |
| SPEC-12 (parte 2) | ASVS nível 2 como checklist em todo ciclo e fechamento no 00023; segredos de integração cifrados no banco (emenda à RF-12.6, seção 9); logs sem dados pessoais e métricas locais; LGPD na parte que é software | RF-12.5, RF-12.6 (emendada), RF-12.9, RF-12.10 (parte de software; prazos e base legal são do Jurídico). RF-12.7 e RF-12.8 em produção são da **Infraestrutura** (seção 11) |
| SPEC-14 (Fase 2) | Portfólio por empresa respeitando permissões, carteiras e atribuição, histórico a partir dos snapshots | RF-14.7, RF-14.8, RF-14.9; RNF-14.1 (no servidor), RNF-14.3. Critério "empresa A não vê obra da empresa B" |
| SPEC-15 (Fase 2) | Catálogo de conectores no servidor, segredos só de escrita e cifrados, testar conexão, saúde, ligar/desligar, permissão e auditoria, webhooks com assinatura, mapeamentos por empresa; encaixe do WhatsApp (sem implementar o conector) | RF-15.6 a RF-15.13; RNF-15.1, RNF-15.2, RNF-15.4, RNF-15.5. Critérios "Fase 2": os 2 |
| Migração do front | O front deixa o IndexedDB como fonte de verdade e passa a ler e gravar pela API; o IndexedDB fica só como origem da importação (revisão do ADR 00002) | SPEC-01 RF-01.5 e risco "um só motor no servidor"; ADR 00002 › Revisão |

**Fora da Fase 2 (explícito):**
- Hospedagem, deploy, domínio, banco gerenciado, registro de imagens, TLS de produção, backups de produção: **Infraestrutura**.
- SPEC-06 `.mpp` (RF-06.6, Fase 3) e, conforme a **PF-1**, a importação/exportação MSPDI no servidor.
- SPEC-08 (WhatsApp, transcrição, IA), SPEC-09 (ERP), SPEC-10 parte 2, SPEC-11 (relatórios e notificações, inclusive RF-14.10), SPEC-13 (piloto).
- RF-01.6 (offline-first), RF-02.6 ("quatro olhos" na linha de base, recomendação: candidato a adendo), RF-04.7 (fechamento agendado), RF-12.11 (teste de intrusão, antes do piloto).
- Redis, filas e jobs (Hangfire/Quartz) e pgvector, previstos no diagrama da SPEC-01 §3: entram com a primeira necessidade real (Fase 3).
- Ingestão mensal oficial do SINAPI das 27 UFs (SPEC-07 RF-07.1/07.1a) e listas oficiais de feriados estaduais e municipais (SPEC-03 RF-03.5): o Plano da Fase 1 os empurrou para "backend"; não constam do pedido desta fase. **Candidatos a adendo** depois do 00017.
- Conector de WhatsApp (sidecar Baileys): **Fase 3**. Aqui só o encaixe (00022).

## 2. Decisões do usuário (25/10/2026) e como o plano as aplica

| Decisão | Onde entra | Observação do arquiteto |
|---|---|---|
| Backend .NET 10 (ASP.NET Core Web API) + PostgreSQL em `server/`, mesmo repositório; front continua Vue 3 | 00011 (ADR 00004: estrutura e convenções) | Coerente com o ADR 00001. D2 (Vue × React) continua "confirmar com a Infra antes da publicação" |
| Só ambiente local (Docker Compose com PostgreSQL para desenvolvimento e testes) | Todos | Nenhum ciclo escolhe provedor, região, domínio ou fluxo de deploy. Os workflows não publicam imagem (Inviolável 8) |
| Segredos de integração no banco, cifrados com ASP.NET Core Data Protection; chave fora do banco (variável de ambiente local em dev; produção onde a Infra definir); API nunca devolve o segredo; configuração pela "Central de integrações" | 00022 (ADR 00008) | **Diverge da SPEC-15 RF-15.7 e da SPEC-12 RF-12.6** ("cofre definido pela Infra"): emenda na seção 9. Detalhe técnico na seção 8.4 |
| Login OIDC genérico + usuário de desenvolvimento só local (desligado fora dele) | 00012 (ADR 00005) | O provedor real e o MFA dependem da **Segurança** (RF-02.1). O usuário de desenvolvimento falha fechado: se ligado fora de `Development`, a API não sobe |
| WhatsApp na Fase 3 com Baileys num sidecar Node, provisório, atrás de interface de provedor | 00022 (só o encaixe) | **Risco a registrar:** Baileys é cliente não oficial; o uso pode violar os termos do WhatsApp e levar ao bloqueio do número. Exige **Jurídico + Segurança** antes da Fase 3 (seção 10) |
| Paridade do motor C# com o TypeScript (CPM em minutos do 00004, EVM, cenários, DLP) | 00016, 00017, 00021 (ADR 00007) | Estratégia na seção 6: fixtures JSON geradas pelo motor TS e consumidas pelo xUnit |
| Isolamento entre empresas testado em toda rota; auditoria append-only; ASVS nível 2 como checklist; SQL parametrizado; sem segredos no código | Todos (Definition of Done de backend, seção 8) | O teste de isolamento é genérico (enumera as rotas) e cobre sozinho as rotas novas de cada ciclo |
| SDK .NET 10.0.402 instalado | 00011 (`global.json`) | Conferido na máquina (`dotnet --list-sdks`); Docker 29.8 também presente, o que viabiliza Testcontainers localmente |

## 3. Arquitetura alvo da Fase 2

```text
[Vue 3 SPA] ──/api (proxy do Vite em dev; mesma origem)──> [API .NET 10, minimal APIs /api/v1]
                                                           ├─ Autenticação: cookie HttpOnly + OIDC genérico (BFF); usuário dev só local
                                                           ├─ Autorização: empresa ativa → perfil → obra/frente (políticas)
                                                           ├─ CronoAI.Dominio: motor puro (calendário, CPM, EVM, cenários, DLP, portfólio)
                                                           ├─ CronoAI.Dados: EF Core + Npgsql, migrações versionadas, auditoria
                                                           └─ Integrações: catálogo, segredos cifrados (Data Protection), webhooks
                                                    PostgreSQL local (Docker Compose; Testcontainers nos testes)
```

- **Projetos** (proposta do ADR 00004, no 00011): `server/src/CronoAI.Api` (host, endpoints, composição), `server/src/CronoAI.Dados` (DbContext, migrações), `server/src/CronoAI.Dominio` (criado no 00012; sem dependências, como o `src/lib` do front), `server/tests/*`. **Direção:** `Api → Dados → Dominio`; o `Dominio` não conhece EF, HTTP nem banco.
- **O TypeScript continua sendo a especificação executável** do cálculo até o fim da Fase 2 (SPEC-01 §3). Depois do 00020, o front não calcula mais nada que vá para a tela; o motor TS fica no repositório como gerador de fixtures. Removê-lo é decisão de um ADR futuro.
- **Mesma origem em desenvolvimento:** o Vite faz proxy de `/api` para a API em `127.0.0.1`. Assim o cookie `SameSite` funciona e a CSP do front mantém `connect-src 'self'`. A topologia em produção (proxy reverso, domínio) é da **Infraestrutura**.

## 4. Ordem recomendada e por quê

| # | Ciclo | Spec | Depende de | Motivo técnico |
|---|---|---|---|---|
| 1 | 00011 | SPEC-01 (fundação) | — (base `master`) | Sem solução, banco local, migração e CI não há onde testar nada. Os scripts do processo já tratam `server/` como T8 (`.claude/scripts/lib/regras-cronoai.mjs:254`) |
| 2 | 00012 | SPEC-02 (identidade), SPEC-01 RF-01.1a | 00011 | Toda rota seguinte exige usuário e empresa ativa. O teste genérico de isolamento nasce aqui para cobrir **toda** rota criada depois (RF-02.3b) |
| 3 | 00013 | SPEC-01 (obras, RF-01.4), SPEC-02 (RF-02.4/02.5) | 00012 | A obra é a 1ª entidade gravável: é nela que se fixam o padrão de concorrência (409) e a gravação da auditoria na mesma transação, antes de existirem tarefas |
| 4 | 00014 | SPEC-02 (RF-02.3/02.3a), SPEC-01 RF-01.1c, SPEC-14 RF-14.8 | 00013 | Permissão por obra e frente precisa de obra; carteira é agrupamento de obras. Fecha a matriz de autorização antes do domínio pesado |
| 5 | 00015 | SPEC-01 §5 (cronograma) | 00014 **e a Fase 1 inteira** (00004, 00005, 00006, 00007, 00010) | O modelo persistido tem de ser o que a Fase 1 validou: minutos e calendários (00004, ADR 00003), premissas versionadas (00005), recorte SINAPI (00006), LB0–LB10 e snapshots (00007), mapeamento de campos (00010). Antes disso, o esquema do banco mudaria a cada ciclo da Fase 1 |
| 6 | 00016 | SPEC-01 (motor), SPEC-05 no servidor | 00015 | Calendário e CPM são a base de EVM, cenários e DLP. Paridade com o motor em minutos do 00004 |
| 7 | 00017 | SPEC-01 RF-01.3 (evm, curva-s, cenários, insumos, orçamento) | 00016 e 00008 (métodos de EV) | Consome o CPM portado. Os métodos de EV e a decisão sobre `safeDiv` vêm do 00008 |
| 8 | 00018 | SPEC-04 no servidor, SPEC-01 RF-01.3 (apontamentos, snapshots) | 00015 (00017 para o PV do snapshot) | Snapshot grava PV/EV/AC calculados pelo servidor; a aprovação de relato altera tarefa com auditoria e versão |
| 9 | 00019 | SPEC-01 RF-01.5 e critério "dois navegadores" | 00012–00018 | A importação dos dados locais só reproduz os indicadores se todas as entidades existirem no servidor. Leitura antes da escrita: o modo servidor já é útil e verificável em leitura |
| 10 | 00020 | Migração do front (escrita) | 00019 | Fecha o critério "edição simultânea gera 409" pela tela e tira o cálculo do navegador |
| 11 | 00021 | SPEC-14 Fase 2 | 00014, 00017, 00018 | Consolida números do servidor (EVM e snapshots) e respeita carteiras e permissões |
| 12 | 00022 | SPEC-15 Fase 2 | 00013, 00014 (e 00010 para o RF-15.13) | Só precisa de perfil de administrador e auditoria. **Pode correr em paralelo** aos ciclos 00015–00018 (arquivos disjuntos) |
| 13 | 00023 | SPEC-12 parte 2 | Todos | Fechamento: verificação do ASVS nível 2 com evidência, LGPD, observabilidade e operação local. Os controles básicos (erros, headers, logs, rate limiting) já nascem nos ciclos anteriores |

**Grafo:**
```
00011 → 00012 → 00013 → 00014 ─┬─ [Fase 1 concluída: 00010 na master] → 00015 → 00016 → 00017 ─┬─ 00018 → 00019 → 00020 ─┐
                               │                                                              └─────────────────────────┴─ 00021 → 00023
                               └─ 00022 (em paralelo a 00015–00018) ──────────────────────────────────────────────────────────┘
```
- **Com a Fase 1 (PF-3):** 00011 a 00014 e 00022 tocam só `server/`, a CI e a documentação. Podem correr em paralelo aos ciclos 00005 a 00010 da Fase 1, que tocam `src/`. Os conflitos esperados são pequenos e de documentação (`CLAUDE.md`, `docs/devops.md`, `.github/workflows/ci.yml`).
- Os demais ciclos são sequenciais, com merge na `master` antes do seguinte. Com issues no GitHub, o número do ciclo passa a ser o da issue.

## 5. Por ciclo

### 5.1 Ciclo 00011 — Esqueleto do backend

| Item | Valor |
|---|---|
| Branch | `feat/00011-backend-esqueleto` |
| Faixa | **3**: T8 (`server/`, migração), T5 (dependências NuGet e imagens novas, workflow), T7 (compose, CI, CodeQL, Dependabot). T1–T4 e T6: NÃO |
| Plano | `00011-backend-esqueleto-plano.md` (rascunho entregue com este plano) |
| Entregáveis | **E1:** solução `server/` (Api, Dados, testes), PostgreSQL no compose (perfil `backend`), migração inicial, health check, OpenAPI gerado no build, erros em ProblemDetails, logs JSON, headers de segurança, testes xUnit com Testcontainers. **E2:** job de CI do backend (sem deploy), CodeQL C#, Dependabot NuGet, documentação e ADR 00004 |
| Requisitos cobertos | RF-01.2 (o pipeline do contrato OpenAPI), RNF-01.3 (parcial: PostgreSQL), RNF-01.4; RF-12.4; RF-12.5 e RF-12.9 (parciais) |
| Fica para depois | Entidades (00012+); autenticação (00012); API em container e serviço `api` no compose (00023); Redis e jobs (Fase 3) |
| Risco de números | Nenhum |
| Dados (`dba`) | Levantamento das convenções de banco (tarefa 0 do plano): nomes, tipos, chaves, papéis |
| Validação obrigatória | `arquiteto`, `dba`, `seguranca`, `testes`, auditoria independente |
| Outras áreas | **Segurança** (dependências e imagens novas), **Jurídico** (licenças PostgreSQL, Apache-2.0, MIT), **Infraestrutura** (versão do PostgreSQL que vai oferecer: P3 do plano do 00011) |
| Estimativa (opinião) | **M** |

### 5.2 Ciclo 00012 — Identidade, empresas e isolamento entre empresas

| Item | Valor |
|---|---|
| Branch | `feat/00012-identidade-empresas` |
| Faixa | **3** (T8 autenticação e banco; T5 dependência `Microsoft.AspNetCore.Authentication.OpenIdConnect`) |
| Entregáveis | **E1:** projeto `CronoAI.Dominio`; tabelas `empresa`, `usuario` (identificado por emissor + `sub` do OIDC, sem senha local), `membro_empresa`; migração. **E2:** autenticação por cookie `HttpOnly`/`Secure`/`SameSite` com OIDC genérico (fluxo de código com PKCE; tokens só no servidor, padrão BFF), configurado por `Autenticacao:Oidc:*`; usuário de desenvolvimento só em `Development` e com a chave de configuração ligada (fora disso a API **não sobe**); `GET /api/v1/eu`; troca de empresa ativa; antiforgery nas escritas; rate limiting no login. **E3:** isolamento: `empresa_id` em toda tabela de dado de empresa, filtro global do EF como defesa em profundidade e autorização explícita por recurso; **teste genérico de rotas** que enumera os endpoints da aplicação e reprova (i) rota anônima fora da lista permitida, (ii) acesso com id de outra empresa que não devolva 404, (iii) rota nova não classificada |
| Requisitos cobertos | RF-01.1 (empresa, usuário), RF-01.1a, RF-02.1 (genérico), RF-02.2 (base), RF-02.3b, RNF-02.1; RF-12.5 (rate limiting no login) |
| Fica para depois | Provedor real e MFA (**Segurança**); SAML, se a Segurança exigir; perfis por obra (00014) |
| ADRs | 00005 (autenticação: OIDC + cookie BFF + usuário dev); 00006 (isolamento multiempresa: coluna + filtro + teste; RLS do PostgreSQL avaliado) |
| Gate esperado do ciclo | (a) testar o OIDC ponta a ponta com um provedor local em container ou só com o usuário de desenvolvimento e o handler configurado; (b) RLS do PostgreSQL como camada extra ou não ([documentação](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)); (c) política de resposta: 404 para recurso de outra empresa (não revela existência) × 403 |
| Validação obrigatória | `arquiteto`, `dba`, `seguranca`, `testes`, auditoria |
| Outras áreas | **Segurança** (provedor, MFA, tempo de sessão); **Jurídico** (nome e e-mail do usuário são dados pessoais; termos de uso multiempresa, controlador × operador) |
| Estimativa (opinião) | **M/G** |

### 5.3 Ciclo 00013 — Obras no servidor, auditoria append-only e concorrência otimista

| Item | Valor |
|---|---|
| Branch | `feat/00013-obras-auditoria` |
| Faixa | **3** (T8) |
| Entregáveis | **E1:** `obra` (dados da RF-14.3 no servidor: nome, UF, município com código IBGE, responsável, data de status, SINAPI UF/regime/data-base, opções do cronograma) e `CRUD /api/v1/obras`. Código IBGE validado no formato (7 dígitos, prefixo da UF); a lista oficial de municípios é insumo a definir. **E2:** concorrência otimista: coluna de sistema `xmin` como token ([Npgsql](https://www.npgsql.org/efcore/modeling/concurrency.html)), `versao` no corpo da escrita e **409 com o estado atual** em conflito (RF-01.4). **E3:** `auditoria` gravada na mesma transação da escrita (interceptor do `SaveChanges`), com antes/depois, usuário, IP, origem e motivo; **append-only no banco**: papel da aplicação sem `UPDATE`/`DELETE`/`TRUNCATE` ([privilégios](https://www.postgresql.org/docs/current/ddl-priv.html)) e gatilho que recusa alteração ([gatilhos](https://www.postgresql.org/docs/current/plpgsql-trigger.html)) (os papéis `cronoai_migrador` e `cronoai_app` já existem desde o 00011). **E4:** exportação CSV da trilha, com neutralização de células que começam com `=`, `+`, `-`, `@` |
| Requisitos cobertos | RF-01.1 (obras), RF-01.1b, RF-01.4, RF-02.4 (base e obra), RF-02.5, SPEC-14 RF-14.3 (servidor) |
| Decisão a registrar | 409 com `versao` no corpo, e não `If-Match` com `ETag`: pela [RFC 9110 §13.1.1](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1), falha de `If-Match` responde 412, e a SPEC-01 pede 409. Prática geral; a escolha fica no plano do ciclo |
| Validação obrigatória | `arquiteto`, `dba`, `seguranca`, `testes`, auditoria |
| Outras áreas | **Jurídico:** IP e usuário na trilha são dados pessoais (retenção) e conflitam com o pedido de exclusão do titular. Decidir antes do piloto |
| Estimativa (opinião) | **M/G** |

### 5.4 Ciclo 00014 — Perfis, permissões por obra e frente, carteiras e gestão de membros

| Item | Valor |
|---|---|
| Branch | `feat/00014-perfis-permissoes` |
| Faixa | **3** (T8) |
| Entregáveis | **E1:** os 7 perfis da SPEC-02 §3 e a matriz perfil × ação **como tabela em código**, aplicada por políticas de autorização; vínculo usuário ↔ obra. **E2:** frentes (RF-01.1c) e atribuição de frente (encarregado/empreiteiro só veem as suas). **E3:** carteiras (regional, cliente, gestor) e atribuição de obras a carteiras e de obras/frentes a engenheiros (RF-14.8). **E4:** gestão de membros pelo administrador (convite por e-mail, que vira vínculo no 1º login; remoção; troca de perfil), com auditoria. Teste parametrizado da matriz perfil × rota |
| Requisitos cobertos | RF-02.2, RF-02.3, RF-02.3a, RF-01.1c, RF-14.8 (modelo e atribuição), RNF-02.3 (minimização: **nenhum telefone na Fase 2**) |
| Critério da SPEC-02 | "Usuário sem vínculo com a obra recebe 403 na API (testado também sem passar pela UI)". O critério "encarregado não aprova o próprio relato" entra no 00018, com os relatos |
| Validação obrigatória | `arquiteto`, `dba`, `seguranca`, `testes`, auditoria |
| Outras áreas | **RH + Jurídico** (perfil Encarregado = trabalhador; dados mínimos) |
| Estimativa (opinião) | **M** |

### 5.5 Ciclo 00015 — Modelo do cronograma no servidor

| Item | Valor |
|---|---|
| Branch | `feat/00015-cronograma-servidor` |
| Faixa | **3** (T8; o modelo replica o T4 do front) |
| Pré-condição | **Fase 1 concluída** (00010 na `master`) |
| Entregáveis | **E1:** tabelas `tarefa`, `vinculo` (tipo, lag em minutos úteis/corridos ou %), `calendario` (intervalos e exceções), atribuição do calendário à tarefa, `premissas` versionadas (`jsonb` com versão), `linha_base` e `linha_base_tarefa` (LB0–LB10), recorte SINAPI da obra e mapeamento de campos; unidades do ADR 00003 (minutos inteiros; `date` para datas de status, reais e de linha de base; data-hora local sem fuso para restrições). **E2:** `GET /api/v1/obras/{id}` com a rede inteira numa leitura (sem N+1) e `PUT /api/v1/obras/{id}/tarefas` em lote, com versão, 409, auditoria (avanço, duração, vínculo, custo, linha de base) e os mesmos limites de entrada do front. **E3:** medição local do RNF-01.1 com obra sintética de 3.000 tarefas e 6.000 vínculos (leitura p95 < 300 ms) |
| Requisitos cobertos | RF-01.1 (EAP, calendário, premissas), RF-01.3 (`GET/PUT tarefas`), RF-01.4, RF-02.4, RNF-01.1 (leitura) |
| Emenda | SPEC-01 §5: `duracao_du`/`lag_du`/`snet` passam a minutos, lag com formato e restrição completa (ADR 00003 e 00004 da Fase 1) |
| Risco de números | Baixo nesta etapa (só persistência), com prova: o estado do Aurora gravado e relido é igual campo a campo |
| Validação obrigatória | `arquiteto`, `dba` (levantamento antes do plano, revisão depois), `seguranca`, `testes`, `especialista-obra` (unidades e campos do MS Project preservados), auditoria |
| Estimativa (opinião) | **G** |

### 5.6 Ciclo 00016 — Motor C# parte 1: calendário em minutos e CPM, com paridade

| Item | Valor |
|---|---|
| Branch | `feat/00016-motor-cpm-paridade` |
| Faixa | **3** (T8; semântica de T1) |
| Entregáveis | **E1:** gerador de fixtures no lado TS e formato versionado (seção 6). **E2:** `CronoAI.Dominio`: calendário de trabalho em minutos e CPM (FS/SS/FF/SF, lags nos três formatos, restrições, prazo final, opções de progresso, calendário por tarefa), com paridade **exata** em datas, minutos, folgas e caminho crítico. **E3:** testes de propriedade (folga ≥ 0 fora do caminho crítico) e desempenho (3.000 tarefas e 6.000 vínculos, CPM < 1 s, RNF-01.1). **E4:** `GET /api/v1/obras/{id}/cronograma` (calculado) e recálculo após escrita |
| Requisitos cobertos | SPEC-01 §3 (motor no servidor) e critério "testes de paridade passam no backend"; RNF-01.1 (CPM) |
| ADR | 00007 (paridade do motor e política numérica: **PF-2**) |
| Processo | Mapear `server/src/CronoAI.Dominio/Motor/**` para T1/T2 no `regras-cronoai.mjs`; hoje T1/T2 só olham `src/lib` e o `especialista-obra` não seria exigido pela rede determinística |
| Risco de números | **Alto.** Diferenças de arredondamento entre JS e C# (seção 6.3) |
| Validação obrigatória | `arquiteto`, `testes`, `especialista-obra`, `seguranca`, auditoria |
| Estimativa (opinião) | **G** |

### 5.7 Ciclo 00017 — Motor C# parte 2: EVM, cenários, suprimentos e orçamento SINAPI

| Item | Valor |
|---|---|
| Branch | `feat/00017-motor-evm-cenarios` |
| Faixa | **3** (T8; semântica de T2) |
| Entregáveis | **E1:** EVM (métodos de EV do 00008, PV por pacote, limiares, variantes de EAC) e Curva S; `GET /evm?data=` e `GET /curva-s?pacote=`. **E2:** cenários (crashing, fast tracking, hora extra por frentes, efeito dominó) com `POST /cenarios/simular|aplicar` e desfazer (cenário aplicado registrado com o estado anterior). **E3:** DLP e alertas; `CRUD /insumos`. **E4:** recorte SINAPI no servidor e `POST /orcamento/gerar` (RUP → duração) |
| Requisitos cobertos | RF-01.3 (evm, curva-s, cenários, insumos, orçamento), critério de paridade CPM/EVM/cenários |
| Risco de números | **Alto.** Dinheiro e índices pela política da PF-2; as dívidas `safeDiv` e `progressPatch` (`CLAUDE.md › Dívida conhecida`) entram com a decisão tomada no 00008, nunca reinterpretadas no port |
| Validação obrigatória | `arquiteto`, `testes`, `especialista-obra`, `seguranca`, auditoria |
| Outras áreas | **Controladoria/Custos** (já envolvida no 00008) |
| Estimativa (opinião) | **G** |

### 5.8 Ciclo 00018 — Histórico e campo no servidor: snapshots, apontamentos, aprovação e anexos

| Item | Valor |
|---|---|
| Branch | `feat/00018-campo-snapshots-servidor` |
| Faixa | **3** (T8, T5: upload de foto) |
| Entregáveis | **E1:** `POST /snapshots` (fechar data de status), imutabilidade no banco (como a auditoria), retificação com motivo, diff e exportação JSON (SPEC-04 RF-04.1, 04.2, 04.6). **E2:** relatos de campo e `POST /apontamentos/{id}/aprovar` (equivalente do `approveReport` no servidor: Inviolável 3; a tarefa precisa existir na obra; **encarregado não aprova o próprio relato**). A sugestão heurística (`fieldAi.ts`) continua no front nesta fase: ela só sugere. **E3:** anexos (fotos) com limite de 8 MB, tipo conferido pelo conteúdo (não pela extensão), sem SVG, servidos com `Content-Type` fixo e `nosniff`. Guarda local em tabela; o armazenamento de arquivos de produção é da **Infraestrutura** |
| Requisitos cobertos | RF-01.3 (apontamentos, snapshots), SPEC-04 no servidor, RF-02.4 (aprovação/rejeição de relato), critério da SPEC-02 (encarregado) |
| Validação obrigatória | `arquiteto`, `dba`, `seguranca`, `testes`, `especialista-obra` (PV/EV/AC do snapshot), auditoria |
| Outras áreas | **Jurídico + RH:** fotos podem mostrar trabalhadores (LGPD). RIPD antes de foto real (critério da SPEC-12) |
| Estimativa (opinião) | **M/G** |

### 5.9 Ciclo 00019 — Front: sessão, leitura pela API e importação dos dados locais

| Item | Valor |
|---|---|
| Branch | `feat/00019-front-sessao-importacao` |
| Faixa | **3** (T8: chamadas de rede em `src/`; T4: a store muda de fonte; T5) |
| Entregáveis | **E1:** cliente HTTP do front e proxy `/api` do Vite; tipos a partir do OpenAPI (gerados ou escritos à mão: decisão do ciclo; gerador seria dependência nova, T5). **E2:** entrar, sair e trocar a empresa ativa. **E3:** obras e módulos em **leitura** pela API (cronograma calculado, EVM, Curva S, insumos, snapshots, relatos); no modo servidor, a store não calcula. **E4:** "Enviar obras locais para o servidor" (RF-01.5): o front migra cada obra até o `ESQUEMA_ATUAL` pela cadeia existente (`src/lib/migracaoEstado.ts`) e envia; o servidor valida tamanho e esquema, grava e devolve os indicadores calculados. O IndexedDB fica só como origem da importação |
| Requisitos cobertos | RF-01.5 e critério "o JSON do protótipo importado reproduz os mesmos indicadores"; critério "dois usuários em navegadores diferentes veem a mesma obra e o mesmo EVM" (E2E com dois contextos e dois usuários de desenvolvimento) |
| ADR | Revisão do ADR 00002: servidor dono dos dados; IndexedDB só leitura, para importar |
| Decisão a registrar | Sem "modo demonstração" só no navegador depois do 00020 (um motor só). A imagem Nginx do front sozinha deixa de funcionar sem a API |
| Validação obrigatória | `arquiteto`, `seguranca`, `testes`, `especialista-obra` (indicadores importados), auditoria |
| Estimativa (opinião) | **M/G** |

### 5.10 Ciclo 00020 — Front: escrita pela API, conflito 409 e fim do cálculo no navegador

| Item | Valor |
|---|---|
| Branch | `feat/00020-front-escrita-api` |
| Faixa | **3** (T8, T4, T6: aprovação de apontamento passa pelo servidor) |
| Entregáveis | **E1:** EAP e dados da obra com versão; diálogo de conflito (409) que mostra o estado atual e deixa reaplicar ou descartar, sem sobrescrever em silêncio. **E2:** cenários (simular, aplicar, desfazer), insumos, orçamento e mapeamento de campos pela API. **E3:** aprovar e rejeitar relatos, fechar data de status, linhas de base. **E4:** a store deixa de importar o motor TS no caminho de produção; o "registro de decisões" mostra o autor (critério da SPEC-02); E2E completo contra API + PostgreSQL na CI |
| Requisitos cobertos | RF-01.4 e critério "edição simultânea gera 409" pela tela; critério da SPEC-02 "toda alteração de avanço mostra o autor"; risco da SPEC-01 "um só motor" |
| Fica para depois | Import/export MSPDI no servidor (**PF-1**) e `.mpp` (Fase 3) |
| Validação obrigatória | `arquiteto`, `seguranca`, `testes`, `especialista-obra`, auditoria |
| Estimativa (opinião) | **G** |

### 5.11 Ciclo 00021 — Portfólio por empresa e carteiras

| Item | Valor |
|---|---|
| Branch | `feat/00021-portfolio-empresa` |
| Faixa | **3** (T8; semântica de T2) |
| Entregáveis | **E1:** consolidação no servidor (ΣPV, ΣEV, ΣAC; SPI do portfólio = ΣEV ÷ ΣPV, nunca média de índices) portada do 00009 com paridade. **E2:** `GET /api/v1/portfolio` filtrado pelas permissões (engenheiro: as suas obras; gestor: a carteira) e por carteira, UF, responsável e situação. **E3:** histórico semanal a partir dos snapshots (RF-14.9). **E4:** último resultado calculado por obra guardado e invalidado pela versão, para 50 obras de 3.000 tarefas em menos de 2 s (RNF-14.1) |
| Requisitos cobertos | RF-14.7, RF-14.8 (visões), RF-14.9, RNF-14.1, critério "empresa A não vê obra da empresa B" |
| Validação obrigatória | `arquiteto`, `dba`, `seguranca`, `testes`, `especialista-obra`, auditoria |
| Estimativa (opinião) | **M** |

### 5.12 Ciclo 00022 — Central de integrações no servidor

| Item | Valor |
|---|---|
| Branch | `feat/00022-central-integracoes-servidor` |
| Faixa | **3** (T8, T5: segredos, webhooks, criptografia) |
| Entregáveis | **E1:** catálogo de conectores em código (só os aprovados; os demais com o estado "Aguardando aprovação de {área}"); ligar/desligar por empresa e obra, com desligamento imediato; só o administrador configura; auditoria **sem o segredo**. **E2:** segredos só de escrita, cifrados com Data Protection (seção 8.4); a tela mostra "configurado em {data} por {usuário}"; teste que procura o valor cadastrado em todas as respostas e nos logs (critério da SPEC-15). **E3:** testar conexão com tempo limite de 10 s, limite de taxa por empresa e resultado categorizado; endereço do provedor só do catálogo (SSRF); um conector "eco" que só existe em `Development`, para os testes; saúde da integração. **E4:** webhooks de entrada genéricos com verificação de assinatura HMAC e janela de tempo contra repetição; **encaixe do WhatsApp**: interface de provedor de mensagens, entrada no catálogo "WhatsApp (Fase 3)" sem implementação e a rota de webhook prevista; mapeamentos por empresa com exceção por obra (RF-15.13). Os cartões da tela "Integrações" (00006/00010) passam a ler o estado do servidor |
| Requisitos cobertos | RF-15.6 a RF-15.13; RNF-15.1, RNF-15.2, RNF-15.4, RNF-15.5; RF-12.6 (emendada) |
| ADR | 00008 (segredos de integração cifrados no banco); emendas da seção 9 |
| Validação obrigatória | `arquiteto`, `dba`, `seguranca`, `testes`, auditoria |
| Outras áreas | **Segurança** (desenho da cifra e do anel de chaves, catálogo D4, webhooks); **Infraestrutura** (onde fica a chave em produção, saída de rede para os provedores); **Jurídico** (contratos dos provedores) |
| Estimativa (opinião) | **M/G** |

### 5.13 Ciclo 00023 — Segurança e operação (SPEC-12 parte 2)

| Item | Valor |
|---|---|
| Branch | `feat/00023-seguranca-operacao` |
| Faixa | **3** (T5, T7, T8) |
| Entregáveis | **E1:** verificação do ASVS nível 2 com evidência por requisito aplicável (checklist da seção 8.1), rate limiting e limites de payload globais revisados. **E2:** observabilidade local: métricas com `System.Diagnostics.Metrics` (latência, erros, tempo de CPM) e correlação nos logs, sem dados pessoais; coletor e alertas são da Infra. **E3:** LGPD na parte de software: inventário de dados pessoais, exportação e exclusão/anonimização a pedido do titular, descarte automático **com os prazos que o Jurídico definir** (sem prazos, fica `NOT_RUN`). **E4:** operação local: `server/Dockerfile` (imagem não root) e serviço `api` no compose (RNF-01.3); procedimento de backup e restauração local com `pg_dump`/`pg_restore` documentado e testado. O backup de produção é da Infra |
| Requisitos cobertos | RF-12.5, RF-12.9, RF-12.10 (software), RNF-01.3 (API no compose), RNF-02.2 |
| Validação obrigatória | `arquiteto`, `dba`, `seguranca`, `testes`, auditoria |
| Outras áreas | **Jurídico** (base legal, prazos, RIPD), **Segurança** (aceite do ASVS L2; teste de intrusão antes do piloto), **Infraestrutura** (RPO/RTO, backup e TLS de produção) |
| Estimativa (opinião) | **M** |

## 6. Estratégia de paridade do motor (TS → C#)

**Objetivo:** o C# reproduz o TypeScript caso a caso, e a divergência bloqueia o merge (SPEC-01 §8; `dev-backend.md › Alvo da SPEC-01`).

### 6.1 Fixtures geradas pelo motor TS
- **Onde:** pasta `paridade/` na raiz (neutra entre front e servidor), com `paridade/casos/{cpm,evm,cenarios,dlp,portfolio,importacao}/*.json` e um `paridade/README.md` com o formato.
- **Formato (proposta):** `{ "formato": 1, "motor": "cpm", "caso": "aurora-linha-de-base", "fonte": "computeSchedule (src/lib/cpm.ts)", "entrada": {…}, "saida": {…} }`. Serialização determinística (chaves ordenadas, sem data de geração), para o diff do PR mostrar só o que mudou.
- **Gerador:** um teste Vitest (ex.: `src/lib/paridade.fixtures.test.ts`) com dois modos. Com `CRONOAI_GERAR_PARIDADE=1`, grava os arquivos. Sem a variável (CI), **compara** a saída atual do motor TS com os arquivos versionados e falha se divergirem. Assim, uma mudança no motor TS sem regenerar as fixtures quebra o CI do front, e a fixture regenerada quebra o CI do backend até o C# acompanhar. Sem dependência nova (o corpus do 00003 já usa leitura de arquivo em teste).
- **Consumo:** xUnit `[Theory]` com um caso por arquivo, comparador que aponta o caminho do campo divergente (ex.: `tarefas[12].folgaTotalMin: esperado 2400, obtido 2880`).

### 6.2 Casos
1. Os casos numéricos já fixados em `src/lib/*.test.ts` (transformados em entrada/saída pelo gerador, nunca reescritos à mão em C#).
2. O Edifício Aurora completo: todas as tarefas (início, término, folgas em minutos, crítica), EVM por data de status, séries da Curva S, os três cenários, alertas de DLP.
3. Os casos de referência do 00004 (CR-1 a CR-12) e dos ciclos 00005, 00007 e 00008.
4. Redes aleatórias com semente fixa (ex.: 50 redes de 30 a 150 tarefas, tipos e lags variados, vários calendários), geradas no TS e gravadas com a saída.
5. Rede sintética de 3.000 tarefas para desempenho. Para não versionar megabytes, opinião: o gerador é determinístico nos dois lados e a fixture guarda só o hash SHA-256 da saída canônica das partes exatas (datas, minutos, caminho crítico).
6. Estados `v1` e por esquema (`src/lib/__fixtures__/estado-v1-aurora*.json`) com os indicadores esperados, para a importação do 00019.

### 6.3 Política de comparação (depende da PF-2)
- **Exatos sempre:** datas, minutos, inteiros, booleanos, enums, ordem e conjunto do caminho crítico, indicadores de restrição e prazo.
- **Dinheiro e índices:** conforme a PF-2. Na recomendação (a), o C# usa `decimal`, e a comparação aceita |Δ| ≤ máx(10⁻⁹ × |esperado|, R$ 0,000001). Os números lidos da fixture são convertidos para `decimal` a partir do literal JSON, não de `double`.
- **Arredondamentos que precisam ser idênticos:**
  - `Math.round` do JS arredonda o meio para +∞ (−2,5 → −2).
  - `Math.Round` do .NET usa, por padrão, o arredondamento bancário (2,5 → 2). Com `MidpointRounding.AwayFromZero`, −2,5 vira −3.
  - O port usa uma função única que replica o JS (`Math.Floor(x + 0,5)`) em todas as fronteiras do ADR 00003. Ela tem teste próprio com 2,5, −2,5, 3.801,6 e 0,5.
- **Datas:** sem `DateTime.Now`, sem `TimeZoneInfo`; relógio local da obra sem fuso, como no ADR 00003.
- Divergência dentro da tolerância numa **fronteira de decisão** (ex.: SPI exatamente 0,95 no limiar de alerta) é tratada como divergência e vai ao `especialista-obra`.

### 6.4 Ciclo de vida
O motor TS é a referência até o 00020. Depois, mudança de regra de cálculo nasce no C#, com o caso de referência no plano. Aposentar o motor TS e o gerador é decisão de um ADR futuro.

## 7. Migração do front (IndexedDB → API)
- **Hoje:** a store usa a interface `ArmazenamentoObras` (`src/stores/armazenamentoObras.ts:17-31`), com adaptadores IndexedDB e memória, gravando o estado inteiro da obra como JSON. O cálculo é derivado na store.
- **Fase 2:** o servidor é dono dos dados e do cálculo. A store passa a falar com um cliente da API (00019 leitura, 00020 escrita), e o JSON único dá lugar a recursos (obra, tarefas, cenários, insumos, relatos, snapshots).
- **Importação (RF-01.5):** a cadeia de migrações do front leva cada obra local ao `ESQUEMA_ATUAL` antes do envio. O servidor aceita **só o esquema atual**. Opinião: não portar a cadeia de migrações para o C#.
- **ADR 00002 › Revisão** é acionado: o IndexedDB vira só leitura, para importar; `cronoai-state-v1` continua nunca apagada (apagar é decisão futura).
- **E2E:** a partir do 00019, o job E2E sobe o PostgreSQL e a API na CI (serviço do Actions ou Testcontainers: decisão do ciclo), sem segredo real (usuário de desenvolvimento).

## 8. Segurança transversal: Definition of Done de todo ciclo de backend

### 8.1 Checklist ASVS nível 2
O `.claude/checklists/seguranca.md` ganha uma seção "Backend — ASVS L2" no 00011. Ela mapeia os capítulos da versão vigente do [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) (5.0, maio/2025; conferir na adoção). O nível 2 é recomendação da SPEC-02 RNF-02.2 e da SPEC-12 RF-12.5 (prática geral, não exigência regulatória). Cada ciclo marca os itens que tocou e o 00023 fecha o restante com evidência.

### 8.2 Em todo ciclo, verificável
- Rota nova coberta automaticamente pelo **teste genérico de isolamento** (00012): a rota não classificada reprova o build.
- Escrita de dado de obra com `versao` e 409 testado; auditoria gravada na mesma transação (00013).
- SQL só pelo EF Core (consultas LINQ e `FromSql`/`ExecuteSql` interpolados, que viram parâmetros). `FromSqlRaw`/`ExecuteSqlRaw` com concatenação proibidos ([documentação](https://learn.microsoft.com/ef/core/querying/sql-queries)). Regra nova no `validar-regras.mjs` (00011 ou 00012).
- Migração nova por mudança, nunca editar migração aplicada; `has-pending-model-changes` limpo na CI.
- Contrato OpenAPI atualizado no mesmo diff (CI compara o arquivo gerado com o versionado).
- Erros em ProblemDetails sem pilha nem SQL; logs estruturados sem dados pessoais ([OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)).
- Nenhum segredo em código, `appsettings*.json`, fixture, log ou workflow; CI sem segredo (Testcontainers gera credenciais descartáveis).
- Dependência NuGet nova listada no plano para revisão de **segurança e licença**; NuGet Audit bloqueia alta/crítica.

### 8.3 Isolamento e autorização
Defesa em camadas (opinião, alinhada ao [OWASP IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)):
1. A empresa ativa vem da sessão, nunca do corpo ou da URL.
2. Autorização explícita por recurso (obra, frente).
3. Filtro global do EF por empresa.
4. Teste de rotas.

Ids em UUID v7 gerados na aplicação (`Guid.CreateVersion7`, .NET 9+) evitam ids sequenciais adivinháveis. A autorização continua sendo o controle real; a decisão final é do `dba` no 00012.

### 8.4 Segredos de integração (decisão do usuário, ADR 00008 no 00022)
- **Cifra:** [ASP.NET Core Data Protection](https://learn.microsoft.com/aspnet/core/security/data-protection/introduction), com *purpose string* por empresa e conector ([purpose strings](https://learn.microsoft.com/aspnet/core/security/data-protection/consumer-apis/purpose-strings)). Um texto cifrado de uma empresa não abre com o *purpose* de outra. O banco guarda só o texto cifrado, a data, o autor e a expiração.
- **Chave fora do banco:** o anel de chaves do Data Protection fica **fora do PostgreSQL** e é cifrado em repouso por uma chave mestra (certificado) fornecida por variável de ambiente local em desenvolvimento ([armazenamento](https://learn.microsoft.com/aspnet/core/security/data-protection/implementation/key-storage-providers) e [cifra das chaves em repouso](https://learn.microsoft.com/aspnet/core/security/data-protection/implementation/key-encryption-at-rest)). Em produção, a **Infraestrutura** define onde ficam o anel e a chave mestra.
  - **Não usar** `PersistKeysToDbContext`: poria a chave no mesmo banco do texto cifrado.
  - **Não escrever** cifra própria ([OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)).
- **Consequências:**
  - perder o anel de chaves torna os segredos irrecuperáveis: o administrador recadastra (documentar);
  - a rotação de chaves é a padrão do Data Protection (chaves antigas continuam decifrando);
  - backup do anel é da Infra.
- **Nunca devolvido:** nenhum DTO de saída tem o campo do segredo (só escrita), e um teste procura o valor cadastrado em todas as respostas e logs.

## 9. Emendas a specs e documentos (a fazer nos ciclos indicados)

| Documento | Emenda | Ciclo |
|---|---|---|
| SPEC-15 RF-15.7 | "guardado no cofre definido pela Infra" → "guardado **no banco da aplicação, cifrado com ASP.NET Core Data Protection**; o anel de chaves e a chave mestra ficam **fora do banco**, em variável de ambiente local no desenvolvimento e, em produção, onde a Infraestrutura definir. A API nunca devolve o valor". Atualizar também "Validar com" (cofre → guarda da chave mestra) | 00022 (ou já no PR deste plano, se você preferir) |
| SPEC-12 RF-12.6 | Separar: segredos **de infraestrutura** (conexão do banco, chave mestra) continuam com a Infra (cofre ou equivalente); segredos **de integração** cadastrados pela tela seguem a RF-15.7 emendada | 00022 |
| `dev-backend.md`, `seguranca.md` (agentes), checklist de segurança | "Segredos em cofre definido pela Infraestrutura" → regra da RF-15.7 emendada | 00022 |
| SPEC-01 §3 | Diagrama: PostgreSQL na versão decidida (P3 do 00011, hoje "16"); Redis, jobs e pgvector marcados "Fase 3"; Data Protection para segredos | 00011 |
| SPEC-01 §5 | Tabela núcleo em minutos (ADR 00003): `duracao_min`, `lag_min` + formato, restrição completa; `empresa_id` nas tabelas de dado de empresa | 00015 |
| SPEC-01 RF-01.3 | Import/export MS Project: conforme PF-1 | gate deste plano |
| ADR 00002 | Revisão: servidor dono dos dados; IndexedDB só para importar | 00019 |
| `CLAUDE.md` | Stack (backend existe), comandos `dotnet`, mapa de `server/`, convenções do backend (apontando para o ADR 00004), agentes `dev-backend`/`dba` ativos | 00011, depois incremental |
| `README.md` das specs | Roadmap: Fase 2 com os ciclos 00011–00023 | PR deste plano |

## 10. Riscos transversais

| Risco | Onde | Mitigação |
|---|---|---|
| Escopo grande (13 ciclos, 4 com G) | Fase toda | Entregáveis com fronteira real; 00022 em paralelo; adendos explícitos em vez de crescer ciclo |
| Modelo do front ainda mudando (Fase 1 em andamento: 00004 em implementação) | 00015+ | Pré-condição: Fase 1 na `master`. Até lá só os ciclos sem domínio |
| Dois motores divergindo | 00016–00021 | Fixtures geradas pelo TS e checadas nos dois CIs (seção 6); `especialista-obra` obrigatório |
| `double` (JS) × `decimal` (C#) e `Math.round` × `Math.Round` | 00016, 00017 | PF-2 e função única de arredondamento com teste |
| Rede determinística do processo não conhece o backend em T1/T2 | `regras-cronoai.mjs` | Mapear `server/src/CronoAI.Dominio/Motor/**` (00016). `testar-afetado.mjs` e `auditar-dependencias.mjs` só tratam npm: no 00011, o orquestrador roda `dotnet test`/`dotnet list package --vulnerable` (registrado em `regras-comuns.md`) |
| Testes de integração dependem de Docker | Todos | Docker presente na máquina; sem Docker, integração `NOT_RUN` local e a CI é a evidência |
| Cookie e CORS entre origens diferentes | 00012, 00019 | Mesma origem via proxy do Vite em dev; produção com a Infra |
| Perda do anel de chaves do Data Protection | 00012 (cookies), 00022 (segredos) | Documentar; segredos recadastráveis; backup do anel com a Infra |
| Trilha append-only × exclusão do titular (LGPD) | 00013, 00023 | Pseudonimização do usuário na trilha, conforme decisão do **Jurídico** |
| Baileys (WhatsApp não oficial) | Fase 3 (encaixe no 00022) | Interface de provedor permite trocar pela API oficial; aval de **Jurídico + Segurança** antes de ligar; sidecar isolado na rede |
| Sem hospedagem, o "multiusuário" só é provado localmente | 00019, 00020 | E2E com dois contextos de navegador e dois usuários; validação real só com a Infra |
| Front deixa de funcionar sem a API | 00020 | Decisão explícita (5.9); imagem do front + API sobem juntas no compose (00023) |
| Conflitos de merge com a Fase 1 em paralelo | `CLAUDE.md`, `ci.yml`, `docs/devops.md` | Mudanças pequenas e localizadas; merge frequente da `master` |

## 11. O que depende de outras áreas

| Área | O quê | Bloqueia |
|---|---|---|
| **Infraestrutura** | Hospedagem, ambientes, domínio, banco gerenciado e versão do PostgreSQL, backup/RPO/RTO (RF-12.8, RNF-01.2), TLS e cifra em repouso (RF-12.7), armazenamento de arquivos (fotos), local do anel de chaves e da chave mestra do Data Protection, saída de rede para provedores, topologia de mesma origem; D2 (Vue × React) e D3 (GitHub × Azure DevOps); uso do GitHub Actions e da proteção da `master` em repositório privado | Uso fora da máquina local, piloto. **Não bloqueia** nenhum ciclo local |
| **Segurança da Informação** | Provedor OIDC real e MFA (RF-02.1); tempo de sessão; aprovação das dependências NuGet, imagens (PostgreSQL, Testcontainers/Ryuk) e de `actions/setup-dotnet`; desenho da cifra de segredos; catálogo de conectores (D4); webhooks; aceite do ASVS L2; teste de intrusão (RF-12.11); Baileys | Login real; uso em produção; ligar qualquer conector. Localmente, o usuário de desenvolvimento destrava os testes |
| **Jurídico** | LGPD: inventário, base legal, retenção e descarte (IP e usuário na trilha, fotos), pedidos do titular, RIPD; termos de uso multiempresa (controlador × operador); licenças (PostgreSQL License, Apache-2.0, MIT; MPXJ LGPL na Fase 3); termos do WhatsApp (Baileys) | Dados reais e clientes; descarte automático (00023 E3 fica `NOT_RUN` sem prazos); WhatsApp |
| **RH + Jurídico** | Perfil Encarregado (trabalhador), dados mínimos | Cadastro de encarregados reais |
| **Controladoria/Custos** | Política numérica de dinheiro (PF-2) e as dívidas `safeDiv`/`progressPatch` (já no 00008) | 00017 |
| **Usuário** | Respostas PF-1 a PF-3; lista oficial de municípios do IBGE (insumo, 00013) | 00013 (só a validação contra a lista) |

## 12. Estimativa relativa (opinião, não compromisso)

| Ciclo | Spec | Tamanho | Motivo |
|---|---|---|---|
| 00011 | SPEC-01 (fundação) | M | Solução, compose, migração, testes com Testcontainers e CI; sem domínio |
| 00012 | SPEC-02 / SPEC-01 | M/G | Autenticação, sessão, empresa ativa e o teste genérico de isolamento |
| 00013 | SPEC-01 / SPEC-02 | M/G | Primeira entidade, padrão de concorrência e auditoria com garantia no banco |
| 00014 | SPEC-02 / SPEC-14 | M | Matriz de perfis, frentes, carteiras, membros |
| 00015 | SPEC-01 §5 | G | Modelo inteiro do cronograma com as unidades da Fase 1 e desempenho |
| 00016 | Motor (CPM) | G | Port do motor em minutos com paridade exata |
| 00017 | Motor (EVM, cenários, DLP, SINAPI) | G | Quatro motores e seus endpoints |
| 00018 | SPEC-04 / campo | M/G | Imutabilidade, aprovação no servidor, upload |
| 00019 | Front (leitura, importação) | M/G | Cliente, sessão e importação com prova dos indicadores |
| 00020 | Front (escrita) | G | Todas as telas de escrita, 409, E2E com backend |
| 00021 | SPEC-14 Fase 2 | M | Consolidação portada, filtros, histórico, desempenho |
| 00022 | SPEC-15 Fase 2 | M/G | Cifra, webhooks, testar conexão, encaixe do WhatsApp |
| 00023 | SPEC-12 parte 2 | M | Verificação, LGPD de software, operação local |

## 13. Perguntas de gate da fase (até 3)

**PF-1 — Importação e exportação do MS Project na Fase 2: no front ou no servidor?**
- **(a)** Ficam no front: o parser TS (`msProjectXmlParser.ts`, endurecido no 00003 e testado no corpus de 134 arquivos) lê o `.xml` e envia o modelo pela API; a exportação monta o `.xml` a partir do modelo do servidor. O servidor valida o modelo e registra a origem "importação" na auditoria. Os endpoints `import/export/msproject` da RF-01.3 entram na Fase 3, junto do `.mpp` (RF-06.6), que é obrigatoriamente no servidor. **Recomendação (opinião):** evita portar cerca de 800 linhas de parser e refazer a paridade com o corpus agora. A Fase 3 decide entre portar o parser ou usar o MPXJ (que lê `.xml` e `.mpp`; LGPL, Jurídico).
- **(b)** Portar o parser para C# na Fase 2 (um ciclo G a mais, entre 00017 e 00018), com XML sem DTD (XXE), limite de tamanho (RNF-06.1) e paridade no corpus.
- *Por que importa:* muda o tamanho da fase, onde mora a proteção XXE e a emenda da RF-01.3.

**PF-2 — Dinheiro e índices no motor C#: `decimal` com tolerância ou `double` idêntico ao JS?**
- **(a)** `decimal` no domínio e `numeric` no banco. A paridade é exata em datas, minutos e caminho crítico, e tem tolerância documentada só em dinheiro e índices (seção 6.3). **Recomendação (opinião):** segue a regra do `dba` (dinheiro em tipo decimal exato) e elimina erro de ponto flutuante nas somas do portfólio. Custo: emenda ao texto "resultados idênticos" do `dev-backend.md` para "idênticos em datas e inteiros; dinheiro e índices dentro da tolerância do ADR 00007".
- **(b)** `double` no motor, operação por operação na mesma ordem do TS, para igualdade bit a bit; `numeric` só na persistência dos valores digitados. Paridade literal, mas carrega para o servidor os mesmos erros de ponto flutuante do front.
- *Por que importa:* define o tipo de todo número financeiro do servidor e o critério de aprovação dos testes de paridade.

**PF-3 — Começar a Fase 2 em paralelo com o fim da Fase 1?**
- **(a)** Sim, para 00011 a 00014 e 00022 (só `server/`, CI e docs), enquanto a Fase 1 termina 00005 a 00010. O 00015 em diante espera a Fase 1 na `master`. **Recomendação (opinião):** antecipa os riscos de processo e ambiente (Docker, Testcontainers, CI .NET, autenticação) sem tocar no que a Fase 1 está mudando.
- **(b)** Não: a Fase 2 começa depois do merge do 00010. Um ciclo por vez, sem conflitos de documentação.
- *Por que importa:* define quando o 00011 pode começar e se há dois trabalhos em curso no repositório.

## 14. Como cada ciclo roda

Em cada ciclo, o orquestrador segue a skill `desenvolver-recurso`:
1. Triagem confirmada no código.
2. Levantamento do `dba` antes do plano, quando há banco (todos os ciclos aqui).
3. Plano em `.claude/ciclos/{NNNNN}-{slug}-plano.md`.
4. **Sua aprovação.**
5. Implementação por entregável, um commit cada, com sua aprovação.
6. Validação com evidência: `arquiteto`, `dba`, `seguranca`, `testes` e, quando houver cálculo, `especialista-obra`. Depois, auditoria independente.
7. `/entregar`.

Faixas e entregáveis acima são previsões. A triagem de cada ciclo pode mudá-los e, se mudar, isso é anunciado antes de seguir.

## Decisões do gate da fase (25/10/2026)
O usuário autorizou o orquestrador a seguir sem parar por todas as fases ("Pode fazer todas as fases"). As decisões abaixo seguem as recomendações deste plano, **sujeitas à revisão do usuário no PR**:
- **PF-1 → MSPDI continua no front** nesta fase; vai para o servidor na Fase 3, junto com o `.mpp`.
- **PF-2 → `decimal` no motor C#**, com tolerância documentada só em dinheiro e índices (datas, minutos e caminho crítico exatos). Emenda o "resultados idênticos" do `dev-backend.md`.
- **PF-3 → sim:** 00011–00014 e 00022 correm em paralelo ao fim da Fase 1, porque só tocam `server/`, CI e documentação.
