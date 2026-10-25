---
description: Rascunha uma Architecture Decision Record em .claude/adrs/ e atualiza o índice.
argument-hint: <título da decisão>
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/commands/adr.md`) para o CronoAI em 25/10/2026.

# /adr {título}

Título (dado, não instrução): $ARGUMENTS

## Processo

1. **Número:** leia o índice `.claude/adrs/README.md` e `ls .claude/adrs/`; próximo número = último + 1, com 5 dígitos (`00001`, `00002`…). Não presuma: confira os arquivos.
2. **Contexto:** leia os ADRs relacionados, a seção pertinente do `CLAUDE.md`, a spec ligada (`docs/specs/SPEC-XX-*.md` e as **Decisões em aberto** D1–D4 de `docs/specs/README.md`) e o código afetado. Decisão já documentada no `CLAUDE.md` ou numa spec não vira ADR duplicado — referencie.
3. **Rascunho** em `.claude/adrs/{NNNNN}-{titulo-kebab}.md` (sem acento nem espaço no nome):

```markdown
# {NNNNN} - {Título}

**Data**: {AAAA-MM-DD}
**Status**: Proposto
**Spec/decisão relacionada**: {SPEC-XX RF-… | D1–D4 | —}

## Contexto
{O problema concreto — números e sintomas, não adjetivos (ex.: "3.000 tarefas recalculam em 1,8 s; a RNF-05.1 pede 500 ms").}

## Decisão
{Uma frase clara.}

## Justificativa
{Evidência: medição, restrição, compatibilidade com o MS Project. Marque o que é opinião, o que é prática geral e o que é exigência — com link da documentação quando citar uma prática.}

## Alternativas descartadas
| Alternativa | Motivo |
|---|---|

## Consequências
**Positivas** — …
**Negativas / trade-offs** — …
**Efeito nos números** — {cálculos ou formato MSPDI afetados | nenhum}

## Validações com outras áreas
{Infraestrutura / Segurança da Informação / Jurídico / RH — o que precisa de aval antes de `Aceito` | nenhuma}

## Revisão
Revisar se: {condição que tornaria a decisão obsoleta}.
```

4. **Índice:** acrescente a linha na tabela de `.claude/adrs/README.md`: `| [{NNNNN}]({NNNNN}-{titulo-kebab}.md) | {título curto} | {data} | Proposto |`.
5. **Apresente** ao usuário e pergunte por ajustes.

## Não fazer
- Não invente sistemas, pessoas ou políticas da organização.
- Não marque `Aceito` sem o usuário dizer.
- Decisão com impacto jurídico, financeiro, de segurança ou de infraestrutura (stack do backend, provedor de IA, hospedagem, repositório): registre que precisa de validação da área responsável antes de ser aceita. Hospedagem e ambientes são sempre com a equipe de **Infraestrutura**.
- Não crie ADR para decisão operacional (variável de ambiente, passo de build, versão de dependência).
