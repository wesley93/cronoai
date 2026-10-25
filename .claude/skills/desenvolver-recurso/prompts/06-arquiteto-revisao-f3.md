> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/skills/desenvolver-recurso/prompts/06-arquiteto-revisao-f3.md`) para o CronoAI em 25/10/2026.

# Prompt — Arquiteto, revisão (faixa 3)

```
FAIXA: 3
TRIAGEM: {sinais T com SIM}
PLANO: .claude/ciclos/{NNNNN}-{slug}-plano.md
BASE: {master | outra}
BRANCH: {branch}
{DIFF: pendente de commit — se for o caso}
{DIFF DESDE: {sha do entregável anterior} — quando houver mais de um entregável}
LINT: {colar}. TYPECHECK: {colar}. TESTES-AFETADOS: {colar}. Não reexecute.

TAREFA: revisão de arquitetura.
- Aderência ao plano aprovado (tarefas, decisões, entregável, escopo fechado).
- Camadas do CLAUDE.md: src/lib puro (sem store, DOM ou localStorage; exceções
  download.ts e useMsProject.ts); estado de domínio e ações só na store; tipos em
  src/types; telas em src/modules/<modulo>/ e src/components/; nada de lógica de
  cálculo duplicada em componente.
- MSPDI (T3): elemento novo entra no SCHEMA_ORDER na posição do esquema; conversões
  de unidade num só lugar (`minutosParaDuracao`, `lagDeMspdi`/`lagParaMspdi`, `diasParaMinutos`/`minutosParaDias`); o import avisa
  o usuário do que não consegue preservar (Inviolável 2).
- Estado salvo (T4): compatibilidade com o formato anterior conforme o plano.
- Entrada externa (T5): limite de tamanho e validação antes do parse; erro sem
  detalhe interno.
- Backend (T8, SPEC-01 em diante): camadas e direção das dependências conforme o ADR
  vigente; contrato da API versionado.
- Nenhuma dependência nova fora do plano.
- Os testes previstos no plano existem e cobrem as regras (números fixados, ida e volta).

Você roda em paralelo com `testes`, `seguranca` e `especialista-obra`: não rode testes
e responda só pelo seu domínio. Termine com VEREDITO: APROVADO | REPROVADO e
PENDENCIAS, e a seção CONHECIMENTO NOVO (mesmo vazia).
```
