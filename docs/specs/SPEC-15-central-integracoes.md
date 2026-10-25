# SPEC-15 — Central de integrações

| Campo | Valor |
|---|---|
| Status | Aprovada pelo usuário em 25/10/2026 (escopo); detalhes por ciclo |
| Fase | 1 (configurações sem segredo, no front) · 2 (conectores com credencial, no backend .NET 10) |
| Prioridade | Média (Fase 1) · Alta (Fase 2, pré-requisito das SPEC-08, 09 e 11) |
| Esforço | P/M (Fase 1) + M (Fase 2, a casca; cada conector entra com a sua spec) |
| Depende de | Fase 1: SPEC-14 (obra ativa), SPEC-07 parcial (recorte SINAPI), SPEC-06 (corpus MSPDI) · Fase 2: SPEC-01, SPEC-02, SPEC-12 |
| Validar com | **Segurança da Informação** (cofre de segredos, provedores aprovados, webhooks), **Infraestrutura** (cofre, saída de rede para os provedores), **Jurídico** (contratos e LGPD dos provedores de IA, transcrição e WhatsApp), **TI dona do ERP** |

## 1. Problema
As integrações do CronoAI estão espalhadas pelas specs, cada uma com a sua configuração e nenhuma com um lugar para configurar:

| Integração | Spec | O que precisa ser configurado |
|---|---|---|
| MS Project | SPEC-06 RF-06.4 | Qual campo personalizado guarda o código SINAPI e o lead time (hoje fixos em Text1 e Number1) |
| Tabela SINAPI | SPEC-07 RF-07.1/07.3 | Recorte da UF, regime e data-base da obra; na Fase 2, a ingestão mensal |
| WhatsApp, transcrição e IA | SPEC-08 RF-08.1/08.3/08.4 | Número da empresa, webhook, provedores aprovados |
| ERP / compras e custo real | SPEC-09 RF-09.2, SPEC-10 RF-10.3 | Conexão, mapeamento centro de custo ↔ pacote da EAP |
| E-mail / Teams | SPEC-11 RF-11.3 | Canal aprovado, remetente, destinatários por papel |
| Login corporativo | SPEC-02 RF-02.1 | Provedor OIDC/SAML da empresa |

Sem uma central, cada conector inventaria a sua tela, o administrador não vê o que está ligado nem o que falhou, e o risco de um token parar no navegador ou num log cresce a cada integração.

## 2. Objetivo
Uma tela única, por empresa e por obra, que mostra cada integração, o estado dela e quem a configurou. Na Fase 1 ela já configura o que não tem segredo. Na Fase 2 ela recebe os conectores com credencial, que ficam **só no servidor**.

## 3. Requisitos funcionais
**Fase 1 — front (sem nenhum segredo)**
- **RF-15.1 Tela "Integrações":** um cartão por integração, com estado em texto e ícone (não só cor): *Configurada*, *Não configurada*, *Requer servidor (Fase 2)* ou *Aguardando aprovação de {área}*. Opera sobre a obra ativa (SPEC-14 RF-14.1).
- **RF-15.2 Cartão SINAPI:** mostra o recorte da obra (UF, regime, data-base, fonte, hash do arquivo de origem e data da importação), importa, substitui e remove o recorte (SPEC-07 RF-07.3; importação do ciclo 00006). Recusa recorte de UF, regime ou data-base diferentes dos da obra, com aviso.
- **RF-15.3 Cartão MS Project — mapeamento de campos personalizados** (SPEC-06 RF-06.4):
  - escolhe o campo do MS Project para cada dado do CronoAI (código SINAPI: Text1–Text30; lead time: Number1–Number20), com o `FieldID` da [referência publicada do MSPDI](https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference);
  - valida tipo compatível (texto × número) e impede o mesmo campo para dois dados;
  - vale na importação e na exportação; o padrão é o atual (Text1 e Number1), de modo que nada muda para quem não configurar;
  - na importação, se o campo mapeado vier vazio e outro campo tiver valores com formato de código SINAPI, sugere o campo com um aviso, sem aplicar sozinho (Inviolável 2: nada é descartado ou trocado em silêncio).
- **RF-15.4 Copiar configuração entre obras:** aplicar o mapeamento de uma obra a outra e exportar/importar a configuração em JSON. **(recomendação)** O JSON nunca contém segredo, porque na Fase 1 não existe nenhum.
- **RF-15.5 Cartões da Fase 2 visíveis, sem campos:** WhatsApp, IA/transcrição, ERP, e-mail/Teams e login corporativo aparecem como *Requer servidor* e citam a spec e a área que precisa aprovar. **Nenhum campo de token, senha ou chave é exibido no front-only.**

**Fase 2 — backend .NET 10**
- **RF-15.6 Catálogo de conectores no servidor:** só aparecem os conectores e provedores aprovados pela Segurança (D4). O endereço de cada provedor vem do catálogo, nunca de URL livre digitada na tela (prevenção de SSRF, [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)).
- **RF-15.7 Segredos só de escrita:** token, chave ou senha é digitado uma vez, enviado ao backend e guardado no cofre definido pela Infra (SPEC-12 RF-12.6). A API **nunca devolve** o valor; a tela mostra só "configurado em {data} por {usuário}" e a data de expiração, quando houver. Trocar o segredo é substituir, não editar.
- **RF-15.8 Testar conexão:** o backend executa um teste mínimo do conector e devolve um resultado categorizado (ok, credencial recusada, provedor indisponível, tempo esgotado), sem detalhes internos nem resposta crua do provedor.
- **RF-15.9 Saúde da integração:** última sincronização, últimos erros (categoria, data, obra), fila pendente e aviso de credencial perto de expirar.
- **RF-15.10 Ligar e desligar:** por empresa e por obra (ex.: WhatsApp só nas obras do piloto, SPEC-13), com desligamento imediato de emergência.
- **RF-15.11 Permissão e auditoria:** só o papel *Administrador da empresa* (SPEC-02) configura; engenheiro e gestor veem o estado. Toda mudança entra na trilha append-only (SPEC-02 RF-02.4/02.5) com antes e depois, **sem o segredo**.
- **RF-15.12 Webhooks de entrada** (WhatsApp, ERP): a tela mostra a URL de recebimento; o backend verifica a assinatura de cada chamada (ex.: assinatura `X-Hub-Signature-256` dos [webhooks da Meta](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)) e descarta o que não confere.
- **RF-15.13 Mapeamentos por empresa:** o mapeamento do MS Project (RF-15.3) e o de centro de custo ↔ pacote (SPEC-10 RF-10.3) passam a valer por empresa, com exceção por obra.

## 4. Requisitos não funcionais
- **RNF-15.1** Nenhum segredo no navegador: nem no `localStorage`, nem em variável `VITE_*` (vai no bundle, SPEC-12 RF-12.4), nem em log, exportação, trilha de auditoria ou mensagem de erro. Prática geral: [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html).
- **RNF-15.2** "Testar conexão" com tempo limite (ex.: 10 s) e limite de taxa por empresa.
- **RNF-15.3** Na Fase 1, a configuração faz parte do estado da obra e segue a cadeia de migrações do ciclo 00002 (T4).
- **RNF-15.4** Isolamento entre empresas: uma empresa nunca vê nem testa conector de outra (SPEC-02 RF-02.3b), com teste automatizado na API.
- **RNF-15.5** Logs das integrações sem dado pessoal (telefone, nome, voz), conforme SPEC-12 RF-12.9.

## 5. Critérios de aceite
- [ ] **Fase 1:** sem configurar nada, exportar o Edifício Aurora gera o mesmo `.xml` de hoje (SINAPI em Text1, lead time em Number1), com teste.
- [ ] **Fase 1:** com o mapeamento em Text5/Number3, importar um `.xml` que usa esses campos traz código SINAPI e lead time certos, e exportar grava nos mesmos campos (ida e volta, `strictOrder`).
- [ ] **Fase 1:** mapear o mesmo campo para dois dados é recusado com mensagem em português.
- [ ] **Fase 1:** nenhum cartão do front-only tem campo de credencial (teste de componente).
- [ ] **Fase 2:** a API de integrações nunca devolve um segredo, nem em erro (teste automatizado procurando o valor cadastrado nas respostas e nos logs).
- [ ] **Fase 2:** um usuário sem o papel de administrador recebe 403 ao alterar ou testar um conector.

## 6. Riscos
- **Credencial no front por atalho:** a tentação de "só testar" com uma chave no `.env` do Vite. Bloqueio: RNF-15.1, revisão de segurança em todo ciclo que tocar a central e a checagem de `.env` já existente no processo.
- **Mapeamento errado silencioso:** trocar Text1 por Text5 numa obra com histórico muda o que é lido. Mitigação: prévia "antes e depois" dos valores antes de salvar e registro no log da obra.
- **Provedor não aprovado:** um conector só entra no catálogo depois do aval da Segurança e, para IA, transcrição e WhatsApp, também do Jurídico.
- **Telas duplicadas:** limiares de SPI/CPI e premissas **não** ficam aqui. Eles pertencem à tela "Premissas da obra" (SPEC-03, SPEC-10 RF-10.6) e às preferências de notificação (SPEC-11 RF-11.4).
