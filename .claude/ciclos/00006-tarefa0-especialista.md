# Parecer do especialista-obra: tarefa 0 do ciclo 00006 (SINAPI layout 2025)

- Plano lido: `planos/00006-sinapi-layout-2025-plano.md` (inteiro).
- Código conferido: worktree `c05`, HEAD `dbaf67f`, depois do 00005.
- Planilha: `referencias/sinapi/2026-09/xlsx/SINAPI_Referencia_2026_09.xlsx`, 13.631.798 bytes.
- Conferência em 25/10/2026 com `openpyxl` 3.1.5 (`python -I`, só leitura). Os scripts descartáveis estão em `scratchpad/s06/` (`conferir_cr.py`, `conferir2.py` a `conferir4.py`, `links.py`, `cr.js`).
- Nenhum arquivo do worktree foi alterado.

```
VEREDITO: REPROVADO (o plano como está escrito; aprovável com as emendas obrigatórias EO-1 a EO-5)
CALCULOS:
| Item | Função (arquivo:linha) | Fórmula | Referência | Caso: entrada → esperado | Teste que fixa | Estado |
| N-1 | sinapiRup.funcaoPrincipal (a criar) | maior coef. entre não apoio | SINAPI Analítico 09/2026 | 103332 → PEDREIRO 1,6225376; 103669 → PEDREIRO (empate); 93358 → SERVENTE | sinapiRup.test.ts (a criar) | PASS (número) / NOT_RUN (teste) |
| N-2 | idem | idem | idem | 107113 → ENGENHEIRO 0,0041 vira principal: 2 eng. → 1 d e 772 serventes | ausente no plano | FAIL (regra) → EO-1 |
| N-3 | recursosDaEquipe (a criar) | ⌈n·cᶠ/cᵖ − 1e-9⌉ | idem | CR-2: proporção 2,0015649 → 5 serventes (4 pela composição) | CR-2 fixa 5 | FAIL (prática) → EO-2 |
| N-4 | sinapi.ts:10-18 | HH/(n × 8) | 00005: h/dia = minutosPorDia ÷ 60 | CR-1 com 450 min/dia: 33 × 450 = 14.850 min < 15.577 necessários | ausente | FAIL (coerência) → EO-3 |
| N-5 | useProjectStore.ts:1104 | bac = Math.round(q × custo) | CLAUDE.md › dinheiro sem arredondar | CR-1: plano 79.334,40; tarefa grava 79.334 | ausente | FAIL (contradição) → EO-4 |
| N-6 | scenarios.ts:223-225 (mainTrade) | maior units sem 'Servente' | D-6 | 107585: 4 armadores + 6 ajudantes → mainTrade = Ajudante | ausente | FAIL (coerência) → EO-5 |
| N-7 | CR-1 a CR-7 (tabela 4.3) | HH, dias, equipe, BAC | xlsx 09/2026 | todos os números do plano recalculados: iguais | a criar | PASS (número) |
PENDENCIAS:
- D-6 / sinapiRup.ts — ENGENHEIRO* e ENCARREGADO* contados como oficiais (174 composições com um deles como principal) — EO-1
- D-6 / tabela 4.3 CR-2 — ceil sobre ruído de arredondamento da publicação (635 composições, equipe 1 a 10) — EO-2
- sinapi.ts:4 HOURS_PER_DAY — 8 h fixas convertidas por minutosPorDia — EO-3
- useProjectStore.ts:1104 — BAC da tarefa arredondado a R$ inteiro, contra a tabela 4.3 — EO-4
- scenarios.ts mainTrade — regra de "função principal" diferente da D-6 — EO-5
```

## 1. Q1 (b): duração pela principal e demais funções proporcionais com ceil

**A regra está certa na essência** (opinião, alinhada à boa prática de dimensionar pela composição como equipe-base). O SINAPI publica consumo de horas por função e por unidade. Ele não publica equipe nem "função principal": isso é uma regra nossa.

**A matemática garante que nenhuma função vira gargalo.** Com nᶠ ≥ nᵖ·cᶠ/cᵖ, vale HHᶠ/nᶠ ≤ HHᵖ/nᵖ. Logo, a duração pela principal é a maior duração entre as funções. Isso é coerente com a composição executada por uma equipe simultânea (concretagem 103681 e 103669).

**Números que um orçamentista acharia errados:**

1. **CR-2: 5 serventes para 2 pedreiros.**
   - A proporção 1,279 ÷ 0,639 = 2,0016 é arredondamento da publicação, não necessidade real (1,279 ≈ 2 × 0,6395).
   - Horas de servente alocadas: 5 × 4 d × 8 h = 160 h. A composição pede 127,9 h, então são 25% a mais. Com 4 serventes, seriam 128 h.
   - O fenômeno não é raro. Em **635 composições**, o ceil com tolerância 1e-9 soma 1 profissional para alguma equipe de 1 a 10 por causa do ruído da publicação. Exemplos: 104658, 105004, 105006 (2,0016) e 103366 (0,5 + ruído; 10 oficiais → 6 serventes em vez de 5).
2. **Supervisão como principal (o erro grave).**
   - A D-6 só exclui `SERVENTE`, `AUXILIAR ` e `AJUDANTE `. `ENGENHEIRO CIVIL DE OBRA PLENO` é principal em 40 composições e `ENCARREGADO GERAL` em 134.
   - Exemplo, 107113 (estaca escavada, servente 1,5816 e engenheiro 0,0041 h/m): com equipe 2, a regra dá principal = engenheiro, HH 0,41, **1 dia e 772 serventes**.
   - Em 101183 (estacão), o encarregado (0,351) vence o pedreiro (0,276).
   - Esse é o número que nenhum orçamentista aceita.
3. **Fração vira pessoa inteira.**
   - Em 999 composições, alguma função tem menos de 0,25 da principal. Com equipe pequena, ela entra como 1 profissional em tempo integral. Exemplo: armação 92762, em que o ajudante tem 0,163 do armador e qualquer equipe até 6 recebe 1 ajudante.
   - A duração não muda. O que infla são o HH alocado e o custo, se o custo for calculado por hora alocada.
4. **O "6,4%" mistura supervisão.**
   - São 546 de 8.595 composições com mão de obra (6,35%) com 2 ou mais "oficiais".
   - Sem engenheiro e encarregado, restam **348 (4,05%)** com dois ofícios de verdade. Os outros 198 só têm 2 oficiais porque um deles é supervisão.

## 2. D-5, D-6, D-7 e D-16

| Decisão | Certa? | Natureza | Observação |
|---|---|---|---|
| **D-5** (mão de obra = `COMPOSICAO` + `H` + sufixo "COM ENCARGOS COMPLEMENTARES"; RUP = coeficiente; só 1º nível) | **Sim** | O "RUP = coeficiente" é **exigência interna** (critério da SPEC-07). A regra de identificação é **observação empírica do layout 2025**, não regra publicada que eu conheça. Ficar no 1º nível é **opinião** aceitável no v1 | Confirmado: 61 funções. A HH das subcomposições fica de fora e não é desprezível. Contrapiso 87630: o operador de betoneira indireto tem 0,218 h/m², contra 0,245 do pedreiro. Na alvenaria 103332, são 0,077. Recomendo nota na tarefa (R-3) |
| **D-6** (principal = maior não apoio; empate = 1º; só apoio → maior de apoio) | **Parcial** | **Opinião** (não há regra da Caixa) | Exige EO-1 (supervisão) e EO-2 (tolerância). Empate e "só apoio" estão certos (103669 → PEDREIRO; 93358 → SERVENTE) |
| **D-7** (só `COM CUSTO` com custo > 0 na UF) | **Sim** | **Boa prática**: custo 0 é ausência de preço, não gratuidade, e viraria BAC 0 sem aviso | Confirmado: 3 composições `COM CUSTO` com custo 0 em alguma UF do `CSD`: 95137 (1 UF), 104088 (21 UFs) e **104094 (4 UFs; o plano não a cita)**. Há 1.753 composições `SEM CUSTO` **com** mão de obra, cuja RUP valeria para prazo. Excluí-las é opinião aceitável no v1 (R-7) |
| **D-16** (rótulo para o `ResourceKind` quando há equivalente) | **Sim** | **Opinião** | Os 10 nomes existem literalmente na planilha. Os rótulos precisam bater com as chaves de `premissas.taxas`, porque `taxaHora` busca por igualdade exata. As demais 51 funções caem em `taxaFuncaoNaoCadastrada` (R$ 30, ilustrativa), que é **maior que o servente (R$ 23,90)**: o auxiliar de encanador "custa" mais que o servente no custo ilustrativo (R-2). A função mais longa tem 53 caracteres: cabe no `MAX_FUNCAO` 60 das premissas. O recorte aceita 80 (alinhar, R-2) |

**Links oficiais.** O documento de metodologia que a **própria planilha oficial** aponta (1.128 hiperlinks) é https://www.caixa.gov.br/Downloads/sinapi-metodologia/Livro_SINAPI_Calculos_Parametros.pdf. Os cadernos técnicos vêm por composição, em links sob `https://www.caixa.gov.br/Downloads/sinapi-cadernos-tecnicos/` (30.669 hiperlinks). Não abri as URLs e não confirmei que estão no ar. Não cito página-índice da Caixa por não ter certeza do endereço.

## 3. Conferência à mão contra o xlsx (9 casos)

Código conferido pela fórmula `HYPERLINK` do `CSD`/`CCD` e pelo Analítico; a unidade é igual nas duas abas.

| Caso | Código | Un | Custo conferido | Coeficientes | Principal | Plano |
|---|---|---|---|---|---|---|
| CR-1 | 103332 | M2 | SP CSD 123,96 / CCD 119,05 | SERVENTE 0,8112688; PEDREIRO 1,6225376 | PEDREIRO | igual |
| CR-2 | 104658 | M2 | SP 208,85 / 205,36 | SERVENTE 1,279; PEDREIRO 0,639 | PEDREIRO | igual |
| CR-3 | 103681 | M3 | SC 904,47 / 897,96 | SERVENTE 1,145; PEDREIRO 1,428; CARPINTEIRO DE FORMAS 0,357 | PEDREIRO | igual |
| CR-4 | 100700 | UN | RN 998,96 / 986,78 | SERVENTE 1,8305384; PEDREIRO 1,7058427; CARP. ESQUADRIAS 4,7714472 | CARP. ESQUADRIAS | igual |
| CR-5 | 93358 | M3 | PI 93,59 / 88,84 | SERVENTE 3,9557667 | SERVENTE | igual |
| CR-6 | 89357 | M | AM 40,38 / **38,84** | ENCANADOR 0,488576; AUXILIAR 0,488576 | ENCANADOR | igual |
| CR-7 | 92413 | M2 | GO 118,57 / 114,02 | CARP. FORMAS 2,052; AJUDANTE 0,376 | CARP. FORMAS | igual |
| CR-8 | 103669 | M3 | SP 1.050,19 / 1.027,49 | SERVENTE 7,377; PEDREIRO 2,459; CARP. FORMAS 2,459 | PEDREIRO (empate) | igual |
| D-7 | 104088 | H | SP 0 / 0, `COM CUSTO`, sem mão de obra | — | — | igual |

Recalculei a tabela 4.3 em Node só com aritmética (`cr.js`):
- dias: 33, 4, 15, 6, 9, 37 e 65;
- equipes: as do plano;
- `640 × 123.96 === 79334.4`;
- HH do CR-6: `1758.8736000000001`, que exige o `toBeCloseTo(…, 9)` previsto.

Proporções "exatas" em ponto flutuante passam pelo −1e-9: CR-1 0,5 → 2; CR-3 0,25 × 4 → 1.

## 4. RUP × coeficiente, HH, horas por dia, dias úteis × corridos

### RUP × coeficiente
Mesmo conceito dimensional: Hh por unidade de serviço.
- O coeficiente do SINAPI é **nacional**: o Analítico é único, sem coluna por UF nem por regime.
- Logo, **a duração não depende de UF nem de regime**; só o custo depende.
- É produtividade de **referência para orçamento**, não a RUP medida na obra. O fator por frente (RF-07.5) está fora do escopo e deve continuar assim, com aviso.

Não afirmo se o coeficiente inclui tempos improdutivos: ver o Livro de Cálculos e Parâmetros e o caderno técnico da composição.

### HH
`HH = quantidade × coeficiente` está correto para a função. A duração usa a HH da principal, e as demais funções saem proporcionais.

### Horas por dia (ajuste ao 00005)
O 00005 decidiu: a fonte da jornada é o calendário; as horas por dia do custo valem `minutosPorDia ÷ 60` (`scenarios.ts:199`); `minutosPorDia` é a conversão dia ↔ minuto do MS Project (480 no padrão, ou o `MinutesPerDay` do arquivo importado). Hoje o SINAPI faz HH ÷ (n × **8**) e depois converte por `diasParaMinutos(dias, minutosPorDia)` (`useProjectStore.ts:1099`). As duas unidades divergem quando `minutosPorDia` ≠ 480:

- **Exemplo com 450 min/dia (obra importada):**
  - CR-1 dá 33 d × 450 = 14.850 min de tarefa.
  - A equipe precisa de 1.038,424064 × 60 ÷ 4 = 15.577 min, então o plano subdimensiona em 727 min.
  - Correto: ⌈1.038,424064 ÷ (4 × 7,5)⌉ = **35 d** = 15.750 min.
- **Nunca usar a média de horas do calendário da tarefa.**
  - Exemplo: calendário de 44 h (seg–qui 9 h, sex 8 h) e `minutosPorDia` 480.
  - Com 8,8 h/dia, o CR-1 daria ⌈1.038,42 ÷ 35,2⌉ = 30 d × 480 = 14.400 min, também abaixo dos 15.577 necessários.
  - Com 8 h (= 480 ÷ 60), dá 33 d = 15.840 min, e o CPM distribui esses minutos nos dias de 9 h corretamente: cerca de 6 semanas de 44 h.
  - O calendário por tarefa já é tratado pelo motor em minutos. A jornada **não** entra na fórmula da RUP.
- **Regra recomendada (EO-3):** h/dia = `minutosPorDia ÷ 60`, a mesma fonte do crashing, em `durationFromTeam`, `teamFromDuration`, `lineDuration` e no custo da calculadora. Os CRs com 480 não mudam. Acrescentar o CR-12 (450 min: CR-1 → 35 d). A jornada real (44 h, sábado) segue com RH + Jurídico.

### Dias úteis × corridos
- A duração SINAPI é **tempo de trabalho** (minutos úteis no calendário da tarefa). O rótulo "d.u." significa "dias de `minutosPorDia`". Num calendário de 9 h, os 33 "d.u." ocupam cerca de 29 a 30 dias úteis de calendário.
- Recomendo mostrar o término calculado pelo CPM (a prévia já o calcula) junto do número de dias (R-5).
- Nunca converter HH para dias corridos direto. Prazo contratual em dias corridos sai das datas do CPM.
- A DLP de suprimentos continua em dias corridos (não muda neste ciclo).

## 5. Regime, UF e data-base

O recorte por **UF + regime + data-base** está coerente com o uso em obra:

- **UF:** muda só o custo, porque o coeficiente é nacional.
- **Regime** (`CSD` sem desoneração × `CCD` com desoneração): muda só os encargos da mão de obra, logo o custo e o BAC. A escolha depende do enquadramento tributário da empresa na contribuição previdenciária; na obra pública, vale o que o edital ou o órgão define. Não é decisão do planejador.
  - **A validar com Contabilidade/Tributário e Orçamento:** a reoneração gradual da folha prevista na Lei 14.973/2024 (2025–2027), segundo meu conhecimento.
  - Não tenho certeza de como a Caixa reflete essa transição na aba `CCD`.
- **Data-base:** é o mês de referência dos preços do orçamento da obra.
  - Está correto desvincular o recorte ao mudar UF, regime ou data-base.
  - Também está correto não recalcular o BAC existente.
  - As composições são revisadas entre publicações (sufixo `AF_mm/aaaa`), então o coeficiente pode mudar de um mês para outro.
  - Recomendo que as notas da tarefa citem, além da fonte, o **coeficiente da principal e a equipe usados** (R-8), para rastrear.
- **`%AS`:** provavelmente é o percentual do custo com preço "atribuído de São Paulo" (origem de preço AS), mas não tenho certeza. Indica quão local é o custo naquela UF. Recomendo levá-lo no recorte (R-4); o significado fica com Orçamento.
- **Encargos horista e mensalista** no recorte: só exibição. Ok.

## 6. Emendas

### Obrigatórias
- **EO-1 (D-6): supervisão não é principal.**
  - `ENGENHEIRO*` e `ENCARREGADO*` ficam fora da escolha da principal enquanto houver outra função. Se só houver apoio e supervisão, a principal é o maior apoio.
  - Decidir como a supervisão entra na equipe:
    - fora dos recursos, como administração local (opinião: preferível);
    - ou com unidades fracionárias, já suportadas: o MSPDI grava `Units` com 2 casas (`msProjectXmlParser.ts:433`).
  - Novos CRs: 107113 (principal SERVENTE; equipe 2 → 10 d) e 101183 (principal PEDREIRO, não o encarregado).
- **EO-2 (D-6): tolerância do ceil.**
  - Trocar o −1e-9 por uma tolerância que absorva o arredondamento da publicação. Opinião: ⌈n·r − 0,05⌉, ou arredondar a proporção a 2 casas antes do ceil.
  - Com isso, CR-2 → **4 serventes**, e CR-3 e CR-7 ficam iguais (4 e 2).
  - O valor exato fica para Orçamento validar, fixado em teste.
- **EO-3 (00005): horas por dia = `minutosPorDia ÷ 60`** nas quatro funções citadas na seção 4, mais o CR-12. É mudança de número (Inviolável 1): explicar antes e depois. Com 480, nada muda.
  - Alternativa: manter 8 h e registrar a dívida com o caso numérico de 450 min.
- **EO-4: BAC da tarefa.**
  - `buildSinapiTask` grava `Math.round(q × custo)` (`useProjectStore.ts:1104`). A tarefa dos CR-1, CR-3, CR-4 e CR-5 recebe 79.334, 289.430, 9.990 e 4.680, não os valores com centavos da tabela 4.3.
  - Opções:
    - tirar o arredondamento (convenção do CLAUDE.md: arredondar só na exibição; o catálogo ilustrativo, com BAC inteiro, não muda);
    - ou fixar no teste o valor arredondado.
  - Decidir e fixar.
- **EO-5: coerência com os cenários.**
  - `mainTrade` (`scenarios.ts:223-225`) escolhe a maior quantidade excluindo só `'Servente'`.
  - Há 94 composições com auxiliar ou ajudante de coeficiente maior que o do oficial. Exemplo: 107585, armador 0,0219 e ajudante 0,0329: 4 armadores + 6 ajudantes → o crashing comprime o "Ajudante de armador".
  - Os cenários estão fora do escopo do plano, então o arquiteto decide entre:
    - usar a mesma regra (`ehFuncaoDeApoio`, ordem com a principal primeiro) com teste;
    - ou registrar a dívida com esse caso numérico.

### Recomendadas
- **R-1:** custo de mão de obra da calculadora (ilustrativo, Q2 = a) por função, como Σ q × cᶠ × `taxaHora(rótulo)`. Calcular por hora alocada com ceil infla o custo com o ajudante extra.
- **R-2:** alinhar os rótulos da D-16 às chaves de `premissas.taxas` e mostrar quais funções caem na taxa não cadastrada. Alinhar o limite de 80 caracteres do recorte com o `MAX_FUNCAO` 60.
- **R-3:** na tarefa e na calculadora, nota "HH de subcomposições (ex.: preparo de argamassa) não incluída".
- **R-4:** levar o `%AS` no recorte.
- **R-5:** exibir "dias (de N h)" e o término do CPM.
- **R-6:** atualizar as linhas do quadro "Contexto para execução" para o HEAD `dbaf67f`: `buildSinapiTask` em `:1080-1112`, `importBudgetCsv` em `:1174`.
- **R-7:** registrar como fora do escopo o uso "só RUP" das 1.753 composições `SEM CUSTO`.
- **R-8:** notas da tarefa com o coeficiente e a equipe.
- **R-9:** registrar que, nas composições mecanizadas (estacas, usinagens), o prazo real é dado pelo equipamento (CHP). Fora do escopo.

## 7. Para validação de Orçamento/Custos (sem decidir por eles)

1. A regra de função principal com supervisão excluída (EO-1) e o destino de engenheiro e encarregado na equipe.
2. A tolerância do ceil (EO-2) e se "equipe mínima de 1 por função" é aceitável quando a função tem menos de 0,25 da principal.
3. O BAC da tarefa com ou sem centavos (EO-4).
4. A exclusão de custo 0 (D-7), inclusive a 104094, e das `SEM CUSTO` com mão de obra.
5. O mapeamento de funções (D-16) e as taxas das funções não cadastradas.
6. O significado e o uso do `%AS`.
7. Ignorar a HH das subcomposições.
8. O regime da empresa e a transição da desoneração, com Contabilidade/Tributário e Jurídico.
9. O critério de custo de mão de obra por coeficiente × hora alocada (R-1), se a Q2 voltar.

## CONHECIMENTO NOVO
- Em 09/2026, `ENGENHEIRO CIVIL DE OBRA PLENO` e `ENCARREGADO GERAL` aparecem como item de mão de obra em 328 composições. São a maior "não apoio" em 174 delas (estacas, tubulões, usinagens, contenções). Regra de principal que só exclui servente, auxiliar e ajudante escolhe supervisão.
- O ruído de arredondamento dos coeficientes (ex.: 1,279 ÷ 0,639 = 2,0016) faz o ceil somar 1 profissional em 635 composições (equipe 1 a 10).
- Coeficientes do Analítico são nacionais e iguais nos dois regimes: duração não depende de UF nem de regime.
- `SINAPI_Referencia` traz hiperlinks oficiais para `Livro_SINAPI_Calculos_Parametros.pdf` e para os cadernos técnicos por composição.
- A 104094 tem custo 0 em 4 UFs no `CSD`, além da 95137 e da 104088.
- O SINAPI calcula em 8 h fixas e converte por `minutosPorDia`: as duas unidades divergem quando o arquivo importado tem `MinutesPerDay` ≠ 480.
