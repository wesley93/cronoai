> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/skills/desenvolver-recurso/prompts/01-dba-levantamento.md`) para o CronoAI em 25/10/2026.

# Prompt — DBA, levantamento ou revisão (T8 com banco; a partir da SPEC-01)

**Hoje o CronoAI não tem banco** (estado no `localStorage`): sem backend, esta etapa é `NA` no ciclo. O prompt vale a partir da SPEC-01 (stack decidida no ADR 00001: .NET 10 + PostgreSQL).

```
FAIXA: 3
MODO: {LEVANTAMENTO | REVISAO}
{PLANO: .claude/ciclos/{NNNNN}-{slug}-plano.md | PEDIDO: "{texto}"}
BASE: {master | outra}
BRANCH: {branch}
{DIFF: pendente de commit — se for o caso}
TRIAGEM: {sinais T com SIM — ex.: T8 (banco), T4 (estado salvo)}

DECISÕES VIGENTES: {ADRs de stack, banco e migração — caminhos | "nenhuma: devolva LACUNA"}

O que o recurso precisa ler ou gravar (linguagem de negócio):
- {item 1 — ex.: snapshots semanais da EAP por obra (SPEC-04)}
- {item 2}

{Com T1/T2 — CASO DE REFERÊNCIA: {entrada → número esperado → fonte}. O tipo da
coluna não pode perder a precisão que este número exige.}

TAREFA (LEVANTAMENTO): modelo de dados a partir dos tipos de src/types/domain.ts e
das tabelas sugeridas na SPEC-01 (recomendação, não decisão), com:
- TIPO EXATO de cada coluna e a unidade: data de calendário × instante UTC; dinheiro
  em decimal com 2 casas (nunca ponto flutuante binário); duração/lag na unidade do
  motor (dias úteis hoje, minutos a partir da SPEC-05) — diga qual;
- isolamento por obra/empresa (toda consulta filtra pela obra do usuário, nunca por
  id vindo do corpo sem checagem — modelo multi-obra da RF-01.1 + autorização por obra da SPEC-02, RF-02.2/RF-02.3);
- concorrência otimista (versão/ETag — RF-01.4) e trilha de autoria/data/origem
  (SPEC-02) onde houver escrita de avanço, custo, vínculo ou linha de base;
- UID do MS Project preservado como dado próprio (não reaproveitar como chave interna);
- migração versionada e idempotente, com o impacto em dados existentes e o caminho
  de importação do estado do localStorage (RF-01.5);
- índices sugeridos e riscos (volume — RNF-05.1 fala em 3.000 tarefas/6.000 vínculos;
  NULL × 0 em % concluído e custo real);
- dado pessoal de trabalhador: quais colunas, retenção e que precisa do Jurídico.
Consultas sempre parametrizadas; nada de valor de obra fixo no código.

TAREFA (REVISAO): confira o diff contra o seu levantamento: colunas e tipos como
levantados, 100% parametrizado, filtro por obra em toda consulta, migração idempotente,
sem perda de precisão nos números. Responda só pelo domínio de dados — camadas são do
arquiteto, OWASP do seguranca, fórmulas do especialista-obra.

Não conecte em banco real nem rode nada que grave. Não crie arquivos. Hospedagem e
banco gerenciado são com a equipe de Infraestrutura: não proponha provedor.

Termine com o bloco VEREDITO: OK | LACUNA | RISCO, um parecer curto e a seção
CONHECIMENTO NOVO (mesmo vazia).
```
