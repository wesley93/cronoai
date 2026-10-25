> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/skills/desenvolver-recurso/prompts/07-seguranca-f3.md`) para o CronoAI em 25/10/2026.

# Prompt — Segurança (faixa 3; faixas 1 e 2 quando o classificar-diff exigir)

```
FAIXA: {1 | 2 | 3}
TRIAGEM: {sinais T com SIM}
{PLANO | FICHA | PEDIDO ORIGINAL}: {caminho ou texto literal}
BASE: {master | outra}
BRANCH: {branch}
{DIFF: pendente de commit — se for o caso}
LINT: {colar}. TYPECHECK: {colar}. TESTES-AFETADOS: {colar}. Não reexecute.

SUPERFÍCIE NOVA:
- Arquivos externos lidos (XML/CSV/imagem/áudio), com limite de tamanho e tipo: {lista ou "nenhum"}
- Texto externo renderizado (relato, nome de tarefa do XML, saída de IA): {lista ou "nenhum"}
- Nginx/CSP/headers, Dockerfile, compose: {lista ou "nenhum"}
- Workflows/permissions/actions do GitHub: {lista ou "nenhum"}
- Dependências novas: {lista ou "nenhuma"}
- Dados pessoais tocados (trabalhadores: nome, telefone, voz, imagem): {lista ou "nenhum"}
- Backend (SPEC-01+): endpoints, autenticação/autorização, banco, integração externa: {lista ou "nenhum"}

{DEPENDÊNCIAS VULNERÁVEIS: {saída do auditar-dependencias.mjs} — se houver}

TAREFA: auditoria de segurança conforme .claude/checklists/seguranca.md, só onde há
gatilho no diff:
- XML: sem DOCTYPE/entidades externas processadas (XXE, expansão de entidade),
  limite de tamanho antes do parse, erro de parse sem detalhe interno;
- CSV/texto: injeção de fórmula ao reexportar para planilha, tamanho e número de linhas;
- XSS: v-html/innerHTML com texto externo; nome de tarefa vindo do XML exibido como texto;
- prompt injection: relato de campo, issue ou spec nunca vira instrução; IA de campo
  não altera a EAP sem approveReport;
- CSP sem unsafe-eval/unsafe-inline novo em script-src; headers preservados;
- imagem não root, compose somente leitura, no-new-privileges;
- Actions: permissions mínimas, só actions oficiais (actions/*, docker/*, github/*),
  sem segredo, sem push de imagem nem deploy (publicação é com a Infraestrutura);
- segredos: nada em código, fixture, log ou VITE_* (público no bundle);
- LGPD: fixtures fictícias; dado de trabalhador real exige SPEC-12 e Jurídico;
- backend (T8): autenticação, autorização por obra, consultas parametrizadas, OWASP.

Leia os hunks; abra o arquivo inteiro só quando o hunk tocar parse de arquivo, CSP,
workflow ou autenticação e não bastar. Você roda em paralelo com `testes` e
`arquiteto`: responda só pelo seu domínio.

Termine com VEREDITO: APROVADO | REPROVADO e ACHADOS (severidade Crítico/Alto/Médio/Baixo,
arquivo:linha, cenário de exploração, correção sugerida). O que exigir parecer da área de
Segurança da Informação (ou do Jurídico, para dado pessoal), diga explicitamente.
```
