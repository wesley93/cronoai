> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/skills/desenvolver-recurso/prompts/05-revisor-f1f2.md`) para o CronoAI em 25/10/2026.

# Prompt — Revisor, passe único (faixas 1 e 2, e /revisar)

```
FAIXA: {1 | 2}
TRIAGEM: {sinais T com SIM | "nenhum (faixa 1)"}
{FICHA: caminho (faixa 2) | PEDIDO ORIGINAL (faixa 1): "{texto literal}"}
BASE: {master | outra}
BRANCH: {branch}
{DIFF: pendente de commit — se for o caso}
LINT: {colar}. TYPECHECK: {colar}. TESTES-AFETADOS: {colar}. Não reexecute.
{REGRAS: saída do validar-regras.mjs — se houver bloqueio}

{Com T1/T2 — CASO DE REFERÊNCIA: {entrada → número esperado → fonte}. A conferência
da fórmula é do especialista-obra; você confere que o número alterado tem teste que o
fixa (Inviolável 1) e que nenhum outro cálculo mudou sem estar na ficha.}

TAREFA: revisão única — blocos A (arquitetura e convenções do CLAUDE.md e de
.claude/rules/), B (segurança), C (escopo) e D (qualidade). Checklists:
.claude/checklists/seguranca.md e .claude/checklists/qualidade.md.

Bloco B na faixa 2: salvo quando o `seguranca` estiver no lote, você é o único
guardião de segurança do ciclo. Confira com profundidade:
- texto ou arquivo externo (relato de campo, XML, CSV, imagem) tratado como dado:
  sem v-html/innerHTML, com limite de tamanho e tipo, erro em português sem detalhe interno;
- IA de campo (T6): nada altera a EAP sem approveReport (aprovação explícita);
- sem segredo em código, fixture, log ou VITE_*; fixtures só com dados fictícios;
- CSP/headers do Nginx não afrouxados; nenhuma dependência nova não prevista;
- workflows (T7): permissions mínimas, só actions oficiais, sem push de imagem nem deploy.

Você roda EM PARALELO com o `testes`: não rode testes.

ESCOPO FECHADO passado aos devs (palavra por palavra):
{colar | faixa 1: "o pedido literal acima"}

RELATÓRIOS DOS DEVS (na íntegra): {colar | faixa 1: "implementado pelo orquestrador"}
Desvio declarado é ponto de partida, não absolvição: confira no diff.

{Se houve — DEPENDÊNCIAS VULNERÁVEIS: {colar saída do auditar-dependencias.mjs}}

O bloco C é o mais importante: arquivo fora da lista ou funcionalidade além do pedido
reprova, mesmo com código bom. Teste existente com asserção alterada sem justificativa
é desvio.

Termine com os blocos do contrato: VEREDITO: APROVADO | REPROVADO, ARQUITETURA,
SEGURANCA, ESCOPO: ADERENTE | DESVIO, QUALIDADE, RESPONSAVEIS — achados com
severidade e arquivo:linha — e a seção CONHECIMENTO NOVO (mesmo vazia).
```
