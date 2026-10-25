> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/skills/desenvolver-recurso/prompts/09-retorno.md`) para o CronoAI em 25/10/2026.

# Prompt — Retorno após reprovação

**Retome o MESMO agente com `SendMessage`** (id do resultado da chamada original): ele já tem ficha/plano e código no contexto. Agente novo só quando a reprovação é de entendimento ("implementou outra coisa").

**Consolide antes de devolver:** pendências de TODOS os validadores do lote numa lista só.

```
RETORNO Nº {1 | 2 | 3} desta etapa.

{Agente novo: repetir FAIXA / TRIAGEM / FICHA ou PLANO / BASE / BRANCH / ESCOPO FECHADO
e, com T1/T2, o CASO DE REFERÊNCIA}

PENDÊNCIAS CONSOLIDADAS (na íntegra, com o autor de cada):
{colar os blocos VEREDITO/PENDENCIAS/ACHADOS/CALCULOS}

TAREFA: corrija APENAS os itens acima. Nada mais — melhoria de passagem reprova no bloco C.

Antes de devolver, varra o seu diff: para cada item, procure o MESMO padrão no resto do
que você alterou e corrija todas as ocorrências, não só a linha citada (ex.: a mesma
conversão de unidade, o mesmo arredondamento, o mesmo campo MSPDI em outro ponto).

Número corrigido (T1/T2): o teste que fixa o valor é atualizado junto, com o antes →
depois no relatório.

Responda item a item: o que fez, onde, e quantas ocorrências do padrão corrigiu.
```

**Revalidação** (na mesma mensagem, depois da correção):
1. o validador que reprovou, só nos itens dele (`REVALIDACAO`);
2. o `testes`, **sempre** — o código mudou;
3. o `especialista-obra`, se qualquer cálculo ou conversão MSPDI mudou na correção;
4. faixa 3: a auditoria em modo delta (`prompts/12-auditoria.md`, agente novo), depois que 1 a 3 aprovarem.

Achado só está resolvido com evidência nova (teste passando ou verificação refeita). No 3º retorno da mesma etapa, pare e leve o impasse ao usuário.
