> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/skills/desenvolver-recurso/prompts/04-testes.md`) para o CronoAI em 25/10/2026.

# Prompt — Testes

```
FAIXA: {2 | 3}
TRIAGEM: {sinais T com SIM}
{FICHA | PLANO}: {caminho} — critérios de aceite e testes previstos estão lá
BASE: {master | outra}
BRANCH: {branch}
{DIFF: pendente de commit — se for o caso}

LINT: já executado — {colar}. Não reexecute.
TYPECHECK: já executado — {colar}. Não reexecute.
TESTES-AFETADOS: {colar saída do testar-afetado.mjs} — referência; você roda de novo.

{Com T1/T2 — CASO DE REFERÊNCIA: {entrada → número esperado → fonte}}
{Com T3 — ARQUIVO DE EXEMPLO: {caminho}}

RELATÓRIOS DOS DEVS (na íntegra, inclusive o NÃO CONCLUÍDO):
{colar}

TAREFA:
1. Rode você o escopo afetado:
   node .claude/scripts/testar-afetado.mjs --base {BASE}   (+ --pendente se DIFF: pendente de commit)
   O TESTES-DEV dos devs é pista de onde olhar, não evidência.
2. Confira teste a teste os "testes previstos" da ficha/plano. Teste previsto e
   ausente é reprovação, mesmo com a suíte verde.
3. Cálculo (T1/T2): cada número do caso de referência tem asserção exata (toBe, ou
   toBeCloseTo com casas declaradas) com o valor explícito. Asserção fraca para cálculo
   exato (toBeGreaterThan, toBeTruthy, só "não lança") = INCONCLUSIVE. Teste existente
   com valor alterado: o ciclo/relatório justifica o antes → depois? Sem justificativa = FAIL.
4. MSPDI (T3): ida e volta buildMspdiXml → parseMspdiXml preserva UID, vínculo (tipo e
   lag), % concluído, datas reais e linha de base; validateMspdi(xml, { strictOrder: true })
   sem erros; entrada malformada e acima do limite de tamanho tratadas.
5. Estado salvo (T4): teste que carrega um estado no formato anterior e abre sem erro
   (setActivePinia(createPinia()) e globalThis.localStorage?.clear?.()).
6. Docker/CI (T7): docker build -t cronoai:local . e o smoke test de docs/devops.md;
   workflow alterado: actionlint (container rhysd/actionlint). Docker indisponível:
   NOT_RUN com o motivo, nunca PASS.
7. Faixa 3 (e sempre que o prompt pedir): npm run ci completo — você é o dono da execução.

Devolva o bloco MATRIZ (Item | Requisito | Verificação | Obrig. | Estado | Evidência), uma linha
por critério de aceite (AC-N) e por número (N-N), MS Project (M-N), persistência (P-N),
segurança (S-N) e visual (V-N) relevantes. Estados só PASS | FAIL | INCONCLUSIVE |
NOT_RUN | NA; evidência = comando + trecho literal da saída. Nada que não rodou vira PASS.

{Em revalidação: "REVALIDACAO — achados: {lista}. Para cada um, o teste que o reproduz
passando; depois o escopo afetado inteiro. Devolva a MATRIZ inteira."}

Termine com VEREDITO: APROVADO | REPROVADO, PENDENCIAS e DEFEITOS DE TESTE.
```
