# Ciclo 00007 — Tarefa 0: parecer do `especialista-obra` (antes da implementação)

- Plano: `scratchpad\planos\00007-snapshots-linhas-base-plano.md` (rascunho, gate do orquestrador de 25/10/2026).
- Base lida, sem alterar nada: worktree `c05` (`aa35221`): `src/data/seed.ts`, `src/lib/evm.ts`, `src/lib/msProjectXmlParser.ts` (`SCHEMA_ORDER` e a exportação da LB0), `src/lib/scenarios.ts`, `src/lib/supplies.ts`, `src/lib/cpm.ts` e `useProjectStore.ts` (os pontos que gravam a LB0).
- Corpus local: `referencias/mpxj-mspdi`, 134 arquivos, lido com `grep`.
- Contas: `node -e` só com aritmética e contagem de dias, sem importar o código.
- Data: 25/10/2026.

**Limite deste parecer.** Não tenho acesso ao MS Project real, e o papel deste agente não inclui consulta à web. O que digo sobre o comportamento do MS Project vem do meu conhecimento do produto e do esquema MSPDI que o projeto já usa. Quando não tenho certeza, a linha diz isso e leva a marca **"confirmar no MS Project real (M-4)"**. Só cito link de fonte oficial quando tenho certeza do endereço.

```
VEREDITO: APROVADO — condicionado às emendas obrigatórias E-1, E-2, E-3 e E-4 antes da tarefa 2 (seção "Emendas")
CALCULOS:
| Item | Função (arquivo:linha) | Fórmula no código/plano | Referência | Caso: entrada → esperado | Teste que fixa (arquivo › nome) | Estado |
| N-1 | totais do Aurora (seed.ts) | BAC = Σ bac; EV = Σ bac×%; AC = Σ custo real | conta à mão | 20 folhas → BAC 19.113.000,00; EV 6.448.200,00; AC 6.896.900,00 | evm.caracterizacao.test.ts (a criar, tarefa 1) | PASS (conta) |
| N-2 | FE-1 (capturarFechamento, a criar) | SPI = EV/PV; CPI = EV/AC; EAC = BAC×AC/EV | PMBOK, D-11 | PV 7.259.250 → SPI 0,888274; CPI 0,934942; EAC 20.442.984,04; pacote 01 AC 2.239.900,00 | fechamentos.test.ts (a criar) | PASS (conta); PV = medição da 00005 |
| N-3 | FE-3 (retificar, a criar) | 104: 40→45%, custo 72.000→75.000 | conta à mão | EV 6.456.600,00; AC 6.899.900,00; SPI 0,889431; CPI 0,935753; EAC 20.425.268,52 | fechamentos.test.ts | PASS (conta) |
| N-4 | C-2 / LB-2 (projeção LB1) | PV = Σ bac × fração linear entre início e término da LB | estimativa do arquiteto | 4.665.000 + 2.200.000×29/37 + 168.000×14/22 = 6.496.233,42; SPI 0,992606 | evm.caracterizacao.test.ts | PASS (conta, com `moverRestante` = true) / INCONCLUSIVE até a medição da tarefa 1 / NOT_RUN quanto à paridade com o MS Project (ver P-12 e E-4) |
| N-5 | C-7 (previsão do 302 e do 104) | saldo = round(dur×(1−%)) em minutos, depois da data de status | regra CR do cpm.ts | 302: 3.802 min (7,92 d); 104: 3.456 min (7,2 d); 8º dia útil depois de 23/10 (com o feriado de 02/11) = 05/11/2026 | evm.caracterizacao.test.ts | PASS (conta) / medição da tarefa 1 prevalece |
| N-6 | LB-3 | atraso = d.u. entre término da LB e término previsto | G5 | plano: 0 d.u. com a LB1 ativa → **com a E-1: +16 d.u. com qualquer LB ativa** | useProjectStore.linhasBase.test.ts | FAIL contra o plano (muda pela E-1) |
| N-7 | LB-4 | tarefa sem a LB n | MS Project (BCWS/BCWP pelo custo da LB do VA) | plano: só o PV → **com a E-2: BAC 18.993.000,00, PV 7.259.250,00, EV 6.448.200,00, AC 6.896.900,00, EAC 20.314.633,80; variante 104: EV 6.381.000,00, CPI 0,925198, PV = medição** | linhasBase.test.ts + store | FAIL contra o plano (incompleto; E-2) |
| N-8 | LB-5 | EV pelo custo da LB do VA | G6 = a | LB0: 6.453.000,00; LB2: 6.448.200,00 | useProjectStore.linhasBase.test.ts | PASS (conta); paridade NOT_RUN (M-4) |
| N-9 | CS-1 | PV linear em d.u., inclusivo | evm.ts:43-56 | 20 d.u.; 5/10/15 d.u. → PV 25.000 / 50.000 / 75.000; fev/26 PV 100.000 | evm.test.ts | PASS (conta) |
| N-10 | CS-2 | interpolação em d.u. (G3 = a) | D-27 | jan/26: 5 de 10 d.u. → EV 65.000,00, AC 69.000,00; corridos 8/14 → 67.142,857143 / 71.428,571429; PV 75.000 / 100.000 / 125.000 | evm.test.ts | PASS (conta) |
| N-11 | TE-1 | SPI/CPI do fechamento | D-32 | 6,8 mi/7,6 mi = 0,894737; 6,8 mi/7,25 mi = 0,937931 | fechamentos.test.ts | PASS (conta) |
| N-12 | DF-1 | Δ término em d.u. | D-33 | 05/11 → 10/11/2026 = +3 d.u. (06, 09, 10); ΔEV A +15.000; EV e AC 40.000 → 55.000 | comparacaoFechamentos.test.ts | PASS (conta), com D = 0% e custo 0 (E-10) |
| N-13 | Paridade MS Project: G5, G6, Interim, rollup, sobrescrita | — | MS Project real | — | M-4 | NOT_RUN (sem MS Project real) |
PENDENCIAS:
- plano §15 G5 / D-6 — a LB ativa nas variações contraria o MS Project (pelo que conheço) — emenda E-1: LB ativa = "LB do valor agregado"; variações continuam na LB0
- plano D-8 / LB-4 — falta definir o EV e o BAC da tarefa sem custo na LB n — emenda E-2 (BAC, PV e EV = 0; AC conta)
- plano C-2 / LB-2 — o PV linear entre o início e o término da LB não enxerga a interrupção da tarefa em andamento; o MS Project daria SPI ≈ 1,00 logo depois de salvar — emenda E-4 (documentar como regra do CronoAI; M-4)
- plano D-10 / D-2 — a LB pode ser sobrescrita, e o fechamento só guarda o número dela — emenda E-3 (`linhaBaseSalvaEm` no cabeçalho e PV por tarefa na tupla)
- plano D-5 / §05 export — rollup da LB n sem duração no resumo; a LB0 de hoje exporta Duration 0 no resumo (msProjectXmlParser.ts:345) — E-6
- useProjectStore.ts:1075 e :1266 — a inclusão de escopo grava só a LB0; com a LB ativa ≠ 0, a tarefa nova fica sem PV e sem EV — E-7 (decisão de Planejamento)
- DF-1 — a tarefa D (nova) está sem % nem custo no caso — E-10
```

---

## Respostas às 12 perguntas

### 1. Semântica de linha de base no MS Project

**Resposta.**

- **Nomes.** "Linha de base" (Baseline) é a LB0. "Linha de base 1…10" (Baseline1…Baseline10) são as LB1–10. No MSPDI, as duas formas são `<Baseline><Number>0..10</Number>` dentro da tarefa; `Number` ausente vale 0, como o parser já faz. O esquema dá esta ordem para os filhos de `<Baseline>`: `TimephasedData, Number, Interim, Start, Finish, Duration, DurationFormat, EstimatedDuration, Work, Cost, BCWS, BCWP`. É a mesma do `SCHEMA_ORDER.Baseline`, em `msProjectXmlParser.ts:91`. *Boa prática/fato do formato*: [Project XML Data Interchange Schema Reference](https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference).
- **O que "Definir linha de base" copia, por tarefa.** Os valores **atuais** de Início, Término, Duração, Trabalho e Custo, além da **distribuição no tempo** (timephased) do trabalho e do custo. Copia também os mesmos campos dos recursos e das atribuições e, a partir do 2010, a duração, o início e o término estimados e os campos de entrega (deliverable). Nada de % concluído. Na tarefa **em andamento**, o Início copiado é o início real e o Término é o previsto. O **Custo** copiado é o campo Custo da tarefa, isto é, o custo total previsto (real + restante), e não um "orçamento" separado. *Fato do produto, alta confiança; confirmar no MS Project real (M-4).*
- **Resumo e rollup.** "Projeto inteiro" grava a LB de **todas** as tarefas, inclusive as tarefas-resumo, com os valores atuais delas: início = menor, término = maior, custo = soma e duração = duração do resumo em tempo útil. As opções "Acumular linhas de base: para todas as tarefas-resumo" e "das subtarefas para a(s) tarefa(s)-resumo selecionada(s)" só valem para "Tarefas selecionadas". Elas dizem se a LB das subtarefas escolhidas sobe para os resumos. Para o CronoAI, que sempre salva o projeto inteiro, a regra do `rollupLinhaBase` (menor início, maior término, soma do custo) coincide com a do MS Project, **menos a duração do resumo**, que o plano não calcula (E-6). *Alta confiança na regra geral; o texto exato das opções: confirmar no MS Project real (M-4).*
- **Sobrescrita.** O MS Project **permite** sobrescrever uma LB já salva. A lista do diálogo mostra "(salva em dd/mm/aa)" ao lado de cada LB usada, e ao confirmar aparece um aviso de que a LB já está em uso, perguntando se deseja sobrescrever. A D-2, com confirmação e motivo, está alinhada e vai além do MS Project, porque registra o motivo. *Alta confiança no comportamento; o texto da mensagem: confirmar no MS Project real (M-4).*
- **Data de gravação no MSPDI.** **Não há**, pelo que conheço. O MS Project guarda a data de gravação da LB no `.mpp` (é a data que o diálogo exibe), mas o esquema MSPDI não tem elemento para ela. A lista `SCHEMA_ORDER.Project`, montada a partir do esquema, não tem nenhum campo de data de LB. No corpus local (134 arquivos, de 2002 a 2019), os únicos elementos com "Baseline" no nome são `<Baseline>`, `<BaselineForEarnedValue>` e `<IsBaselineCalendar>`, e a única data de gravação é `<LastSaved>`, que é a do **arquivo**. *Evidência do corpus e do esquema: alta confiança, mas confirmar no MS Project real (M-4).* Por isso, a decisão do plano de levar nome, motivo, autor e data só no JSON do histórico (D-34) está correta.
- **Duas observações do código, fora das perguntas:**
  - O `saveBaseline` de hoje grava `baselineDuracaoMin = s.duracaoMin`, que é `minutosUteisEntre(início, término)` (`cpm.ts:434`): o **vão** em minutos úteis. Na tarefa em andamento com o saldo empurrado para depois da data de status, isso inclui a interrupção. O 302 daria cerca de 36,9 d em vez de 36 d. No MS Project, a Duração da LB é a Duração da tarefa (36 d), sem a interrupção. Afeta só a duração exportada da LB n, e não o PV, que usa as datas. *Confirmar no MS Project real (M-4)*; registrar como limitação, sem mudar neste ciclo.
  - O custo da LB n = `bac` (D-2) é coerente com o que o CronoAI já exporta como `Cost` da tarefa (= `bac`, `msProjectXmlParser.ts:272`, `:315`). Só que o MS Project copiaria o Custo total previsto, e não o orçamento. Hoje, os dois coincidem porque o CronoAI não tem custo restante por tarefa.

**O que muda no plano:** ajuste. E-6 (duração do resumo na LB n) e uma nota na `divida-conhecida.md` sobre a duração da LB como vão. O resto fica como está.

**Natureza:** fato do produto (alta confiança; M-4); a duração do resumo é opinião.

### 2. `BaselineForEarnedValue` (gate G5)

**Resposta.** Pelo que conheço do MS Project, a opção "Linha de base para os cálculos de valor agregado" (Opções › Avançado › Opções de valor agregado deste projeto; elemento `BaselineForEarnedValue` do projeto, 0–10) afeta **só os campos de valor agregado**:

- campos afetados: BCWS (PV), BCWP (EV), SV, CV, SV%, CV%, SPI, CPI, BAC, EAC, VAC e TCPI;
- campos **não** afetados, que **sempre** comparam com a **Linha de base (0)**: Variação de início, Variação de término, Variação da duração, Variação do trabalho e Variação de custo (Custo − Custo da LB);
- as barras de LB do Gantt de Controle também usam a LB0 por padrão;
- as LB1–10 não têm campo de variação próprio: quem quer comparar com elas usa campo personalizado com fórmula ou o modo de exibição "Gantt de várias linhas de base".

*Alta confiança; confirmar no MS Project real (M-4).*

**Conflito confirmado com o RF-04.5** ("no PV e nas variações"). Para o CronoAI:

- **Recomendação (opinião): seguir o MS Project.** A LB ativa vira a "**LB do valor agregado**" e vale para PV, EV, BAC, SV, CV, SPI, CPI, EAC/ETC/VAC/TCPI, a Curva S, o EVM por pacote, a tendência e a previsão de término pelo SPI (IEAC(t) = duração planejada ÷ SPI: o MS Project não tem esse campo, mas ele deriva do SPI e precisa da mesma LB do SPI).
- **Continuam na LB0:** o atraso e a variação de término (`analyzeDelay`, `finishVarianceDays`), a meta de recuperação dos cenários, o "deslocamento da frente" da DLP (`supplies.ts:96`), a barra de LB do Gantt e a coluna de LB da EAP.
- **Por quê:**
  1. o `.xml` exportado leva `BaselineForEarnedValue = n`, e no MS Project o usuário veria o atraso contra a LB0. Com a regra da opção (a), CronoAI e MS Project mostrariam atrasos diferentes para o mesmo arquivo, a "divergência com o MS Project" que o projeto tenta evitar (SPEC-05);
  2. na prática de obra, o prazo contratual (LB0) costuma continuar sendo a régua de atraso (multa, aditivo de prazo) mesmo depois de um replanejamento, que muda a régua de desempenho. *Opinião de prática; Planejamento/Controle valida.*
- **Custo da recomendação:** contraria o texto do RF-04.5, e a spec precisa ser atualizada por quem é dono dela. Fica o pedido a Planejamento/Controle. Se a empresa quiser medir o atraso contra a LB replanejada, a forma compatível com o MS Project é um **seletor separado** ("comparar variações com: LB0 | LBn"), com rótulo explícito. Isso fica fora deste ciclo.

**O que muda no plano:** **emenda E-1** (obrigatória pelo próprio gate do orquestrador: "se a tarefa 0 disser que o MS Project usa a LB ativa só no valor agregado, a regra passa a seguir o MS Project").

**Natureza:** fato do produto (alta confiança, M-4); RF-04.5 = exigência interna (spec), em conflito; recomendação = opinião.

### 3. BCWS/BCWP contra a LB n (gate G6)

**Resposta.**

- **Custo usado.** No MS Project, BCWS e BCWP usam o **custo da LB escolhida para o valor agregado** (Custo da LB n e a distribuição dele no tempo). BCWP = % concluído (ou % físico, conforme o método) × Custo da LB n. BAC = Custo da LB n. Mudar o custo da tarefa depois de salvar a LB **não** muda BCWS, BCWP nem BAC. Isso confirma o **G6 = (a)**. *Alta confiança; confirmar no MS Project real (M-4).*
- **Tarefa sem LB n, ou com a LB n sem custo.** No MS Project, BCWS = 0, **BCWP = 0** e BAC = 0, e o ACWP (custo real) **continua contando**. É a queixa clássica de "o valor agregado está zerado porque a tarefa não tem linha de base". O plano (D-8, LB-4) trata só do PV. A projeção da D-6 ("`bac` = custo da LB n") já levaria a EV = 0 e BAC menor se ninguém puser um *fallback*, mas isso precisa estar **escrito e testado**:
  - LB-4 (801 sem LB3): BAC 18.993.000,00; PV 7.259.250,00; EV 6.448.200,00 (o 801 está em 0%); AC 6.896.900,00; CPI igual; EAC = 18.993.000 × 6.896.900 ÷ 6.448.200 = **20.314.633,80**;
  - variante com o 104 sem LB3: EV = 6.448.200 − 0,40 × 168.000 = **6.381.000,00**; AC 6.896.900,00 (inalterado); CPI **0,925198**; PV = 7.259.250 − contribuição do 104 na LB0 (medida na tarefa 1);
  - aviso: "N tarefa(s) sem a linha de base n: o PV, o EV e o orçamento (BAC) delas são zero; o custo real continua contando."
- **LB n com custo e sem datas.** A D-8 dá PV 0 e EV = % × custo. No MS Project, sem datas não há distribuição e o BCWS fica 0. O BCWP, eu acho que segue o custo, mas **não tenho certeza: confirmar no MS Project real (M-4)**. Manter a regra do plano, que é a da LB0 de hoje.
- **Assimetria que já existe (registrar como dívida, sem mudar agora).** Na LB0, o "custo da LB" é o `bac` **vivo**: editar o `bac` depois de salvar a LB0 muda o PV e o EV, e no LB-5 o EV com a LB0 sobe para 6.453.000,00. No MS Project, o Custo da LB0 ficaria congelado. Com o G6 = (a), as LB1–10 congelam o custo e a LB0 não. Isso é coerente com a garantia "nada muda com a LB0" (D-1), mas precisa estar na `divida-conhecida.md` e no rótulo da tela. Resolver de vez exige separar orçamento e custo da LB0 num ciclo próprio, com os números da base refixados.

**O que muda no plano:** **emenda E-2** (D-8, LB-4, aviso, `divida-conhecida.md`). O G6 = (a) fica confirmado e deixa de ser provisório, com M-4 pendente.

**Natureza:** fato do produto (alta confiança, M-4); a assimetria da LB0 é achado do código.

### 4. Interim plans (planos provisórios)

**Resposta.**

- **O que são.** "Definir plano provisório" copia **só Início e Término** (das datas atuais ou de uma LB) para os pares Início1/Término1 … Início10/Término10. Não copia duração, trabalho nem custo, e nenhum cálculo de valor agregado nem de variação usa esses campos. São fotos leves de datas.
- **No MSPDI.** Início1–10 e Término1–10 são campos personalizados de data e saem como `ExtendedAttribute` (com o `FieldID` do campo), e não dentro de `<Baseline>`. O elemento `Interim` (booleano) dentro de `<Baseline>` existe no esquema, mas não sei dizer com certeza quando o MS Project o grava com 1. **Confirmar no MS Project real (M-4).** No corpus: 0 ocorrências de `<Interim>1` em 134 arquivos.
- **Avaliação.** Ignorar `<Baseline>` com `Interim = 1`, com aviso, está **correto**: não é LB, e não pode ocupar a posição da LB n. Os Início/Término1–10 caem no aviso único que já existe para campos personalizados não mapeados (ciclo 00010, `ExtendedAttribute`).

**O que muda no plano:** nada. Só uma nota na `msproject-mspdi.md` dizendo que os planos provisórios chegam por `ExtendedAttribute` (00010).

**Natureza:** fato do produto (alta confiança no conceito; o uso do `Interim` fica para o M-4).

### 5. O que congelar num fechamento

**Resposta.** A lista da D-10 cobre a rotina de controle físico-financeiro: % físico, custo real, BAC, datas reais e previstas, folga, crítica, totais e pacote, LB e versão das premissas. **Duas lacunas por causa da sobrescrita de LB (D-2):**

- O fechamento grava só o **número** da LB. Se a LB1 for sobrescrita depois, "fechado contra a LB1" passa a apontar para outra LB, e não há como saber. **Proposta: `linhaBaseSalvaEm`** (o `salvaEm` da LB usada) no cabeçalho, para a tela dizer "fechado contra a LB1 de 25/10/2026; a LB1 atual é de 30/11/2026".
- Sem o PV por tarefa, a comparação entre fechamentos (RF-04.6) não consegue mostrar SV por tarefa depois que a LB muda. **Proposta: o `pv` (R$) na tupla**, cerca de 10 caracteres a mais por tarefa (+30 mil por fechamento de 3.000 tarefas, dentro da folga da D-23).

Duração restante: dá para derivar do previsto e não é essencial (opinião). Trabalho: não há recurso no cálculo, então não. Custo previsto no término por tarefa: o CronoAI não tem ETC por tarefa, então não. Quantidade medida (boletim de medição por serviço): é útil na obra, mas pertence à SPEC-10 e à SINAPI, fora daqui.

**SPI/CPI nulos sem divisor (D-11): corretos.**

- Sem PV ou sem AC, o índice é **indefinido**, e congelar 1,00 num registro imutável seria gravar um número falso. *Boa prática de cálculo (sem link oficial que eu possa citar com certeza).* Não tenho certeza de como o MS Project exibe o SPI com BCWS = 0 (acho que 0,00): **confirmar no MS Project real (M-4)**. Para um registro imutável, `null` com "—" na tela é melhor que qualquer convenção de exibição.
- EAC nulo com EV = 0 ou AC = 0: correto pela fórmula EAC = BAC ÷ CPI.

**O que muda no plano:** **emenda E-3**: `linhaBaseSalvaEm` no cabeçalho; `pv` na tupla (12 posições, `versaoFormato: 1` com a ordem nova); limites do S-2 ajustados.

**Natureza:** opinião (conteúdo); boa prática (nulos).

### 6. Curva S planejada × replanejada

**Resposta.**

- **Prática.** Em obra, é comum mostrar o PV da **LB vigente** (replanejada) junto com o PV **original** (LB0, a curva contratual e do desembolso previsto), para deixar visível quanto o replanejamento "moveu a régua". Mostrar só a vigente esconde o replanejamento. *Opinião de prática; Planejamento/Controle valida.*
- **Recomendação.** Quando a LB ativa ≠ 0, a LB0 aparece como série de referência (linha fina, com legenda e coluna na tabela). O plano deixou "dois PVs" fora do escopo, salvo emenda. Isto **não bloqueia**. Se o orquestrador quiser o escopo mínimo, registrar como pendência.
- **EV e AC passados ficam como gravados, com a nota "fechado contra a LBk" (D-26).** Está **correto**: são fatos medidos. Com a E-2, o EV gravado usa o custo da LB da época; se o custo da LB ativa for diferente, o ponto passado mistura bases de custo, e a nota precisa dizer isso. O SPI da tendência (D-32) é o **gravado**, contra a LB da época, e pode não bater com EV ÷ PV da curva redesenhada. A tela precisa explicar: "índices dos fechamentos calculados contra a linha de base vigente em cada fechamento".
- **Tracejado (D-31).** O `SCurveChart` já usa tracejado para a **tendência** (previsão). Usar o mesmo traço no EV/AC interpolado cria ambiguidade. Recomendo um padrão diferente (pontilhado curto, por exemplo) e a coluna "Origem" na tabela. A cor e o traço não podem ser a única pista. *Opinião, com a regra do `CLAUDE.md` (legenda e tabela sempre).*

**O que muda no plano:** ajuste E-9 (padrão de traço diferente da tendência; texto da nota). A série da LB0 é opcional.

**Natureza:** opinião.

### 7. Interpolação entre fechamentos (gate G3) e reconstrução ancorada

**Resposta.**

- **Interpolação.** Em **dias úteis do calendário padrão**, sem as exceções úteis: correto. É a mesma régua do PV (`elapsedFraction`), e obra não avança no fim de semana nem no feriado. A interpolação é só uma representação gráfica entre dois fatos, e o tracejado deixa isso claro. CS-2 conferido: 5 de 10 d.u. dá EV 65.000,00 e AC 69.000,00 (corridos 8/14: 67.142,857143 e 71.428,571429).
- **Reconstrução ancorada no 1º fechamento (D-28): aceitável como "pré-histórico"**, com o aviso. Tem duas vantagens certas:
  - continuidade: o fechamento é a foto do estado vivo na mesma data, então a reconstrução sai idêntica (CS-3);
  - o passado deixa de mudar com o avanço futuro (CS-3b), que é o defeito que a SPEC-04 quer resolver.

**Observação para o dev, sem mudar o escopo.** Na `computeSCurve` de hoje, o ponto do mês da data de status tem `date` = fim do mês, mas os valores são da data de status, e não existe ponto de fim de mês para esse mês. No CS-2, a curva termina em "fev/26 ●" com PV 125.000 e nunca mostra os 200.000 da LB, que termina em 27/02. É comportamento da base (C-1): **não "consertar" de passagem**. O teste do CS-2 deve listar exatamente 3 pontos.

**O que muda no plano:** nada no G3 (confirmado). Nota no CS-2 (E-11).

**Natureza:** opinião (método); a exibição tracejada é exigência do RF-04.3.

### 8. Retificação

**Resposta.**

- **O que se corrige na prática.**
  - **Medição física**, quando o % foi apontado errado ou o boletim foi revisto com a fiscalização;
  - **custo real**, quando a nota fiscal foi lançada no centro de custo errado, chegou atrasada ou foi estornada (o AC pode **diminuir**);
  - às vezes, a **data real** de início ou de término apontada errada.
  As datas previstas são consequência do cálculo e não se "corrigem" no fechamento. A D-15 (só % e custo, mantendo a previsão do original com a nota) está adequada para este ciclo. Datas reais ficam como pendência de Planejamento/Controle. *Opinião.*
- **Retificar depois de avançar a data de status.** Acontece com frequência: o erro do mês N aparece no fechamento do mês N+1. O plano permite e deve continuar permitindo.
- **Cadeia apontando para a raiz, efetivo = maior `sequencia`:** correto.
- **Faltam duas salvaguardas (opinião):**
  - **Coerência com os vizinhos.** Uma retificação pode deixar o EV da data N **maior** que o do fechamento N+1 (curva de EV decrescente) ou levar o % de uma tarefa acima do % dela no fechamento seguinte. Não é para bloquear, porque o custo pode cair legitimamente por estorno, mas o diálogo deve **avisar**: "O EV retificado (R$ …) fica acima do EV do fechamento de 30/10/2026 (R$ …): confira os fechamentos seguintes."
  - **A retificação não altera a obra atual.** Se o erro continua no estado vivo, o engenheiro precisa corrigi-lo também. O diálogo deve dizer isso.

**O que muda no plano:** ajuste E-5 (os dois avisos e um teste com o número).

**Natureza:** opinião de prática; Planejamento/Controle valida a rotina.

### 9. Rotina de fechamento e data de status

**Resposta (prática de obra, opinião).**

- **Frequência.**
  - **Mensal** é a rotina formal mais comum: ligada à medição, ao faturamento e ao fechamento contábil;
  - a data de status costuma ser a **data de corte da medição**, que nem sempre é o último dia do mês (dia 25, por exemplo);
  - muitas obras também atualizam o cronograma **semanalmente** (programação de curto prazo) sem um "fechamento" formal.
  O plano comporta as duas rotinas: ponto de fechamento em qualquer data (D-25) e limite de 104 = 2 anos semanais ou mais de 8 anos mensais.
- **Dois fechamentos na mesma semana:** é raro, mas legítimo em datas diferentes (corte da medição e reunião de diretoria, por exemplo). Não há por que bloquear.
- **Data de status voltando antes do último fechamento (D-13):** concordo em bloquear e apontar "Retificar". Voltar a data de status para uma data já fechada geraria uma previsão diferente da gravada para a mesma data.
- **Obra alterada depois do fechamento, na mesma data (D-14):** concordo com a faixa sem bloqueio. Na prática, o engenheiro costuma acertar o cronograma logo depois de fechar.
- **Sugestões (opinião, não bloqueiam):**
  - avisar quando há **relatos de campo pendentes de aprovação** ao fechar (o seed tem 4 pendentes em 23/10: o FE-1 mostraria o aviso), porque o fechamento deveria conter todas as medições aprovadas;
  - avisar quando a **data de status é posterior a hoje** (fechar o futuro). O MS Project aceita data de status futura, então isso é só aviso.

**O que muda no plano:** ajuste E-8 (os dois avisos). Validação de Planejamento/Controle antes do piloto, como o plano já prevê.

**Natureza:** opinião.

### 10. Hora da LB

**Resposta.** Aceitável neste ciclo (opinião).

- **Por quê:** o PV do CronoAI trabalha em dia inteiro (fim do dia da data de status), e a LB0 já perde a hora hoje.
- **Efeito no MS Project:** uma LB n com início às 09:00 volta como 08:00, e uma tarefa de meio período que termina às 12:00 volta com término às 17:00. A variação de início ou de término calculada pelo MS Project, sempre contra a LB0, e a duração exibida podem mostrar frações de dia (até ~0,5 d) que não existiam.
- **O que fazer:** registrar na `divida-conhecida.md` e no aviso da exportação ("as datas das linhas de base vão com o horário padrão: 08:00 e 17:00").

**O que muda no plano:** ajuste mínimo (texto do aviso e da dívida).

**Natureza:** opinião.

### 11. Trabalho (Work) da LB

**Resposta.** Sem recurso no cálculo, o aviso no import basta para o **cálculo**. Para o **Inviolável 2**, porém, a ida e volta perde o trabalho da LB de quem reabre o arquivo no MS Project. Há duas saídas (opinião):

- **(a)** avisar também na **exportação**: "o trabalho das linhas de base não é devolvido";
- **(b)** guardar o `Work` como valor opaco (`trabalhoMin?` em `DadosLinhaBase`) e devolvê-lo sem tocar. Custa pouco porque a LB é congelada, mas cria assimetria com a LB0, que hoje também perde o `Work`.

Recomendo a **(a)** neste ciclo e a (b) para LB0–10 juntas no ciclo do mapeamento de campos (00010).

**O que muda no plano:** ajuste E-12 (aviso na exportação).

**Natureza:** opinião.

### 12. Números

Todos recalculados com `node -e`, só com aritmética e contagem de dias. Os feriados do caso são 12/10/2026 (segunda) e 02/11/2026 (segunda); 15/11 cai num domingo.

| Caso | Conta | Resultado | Situação |
|---|---|---|---|
| Totais do Aurora | 20 folhas; Σ bac; EV = 180.000 + 1.150.000 + 820.000 + 2.350.000 + 0,78×2.200.000 + 165.000 + 0,40×168.000; AC = Σ custo real | BAC **19.113.000,00**; EV **6.448.200,00**; AC **6.896.900,00** | confere |
| FE-1 | SPI = 6.448.200/7.259.250; CPI = 6.448.200/6.896.900; EAC = 19.113.000×6.896.900/6.448.200; pacote 01 AC = 186.400 + 1.212.000 + 841.500 | **0,888274**; **0,934942**; **20.442.984,04**; **2.239.900,00** | confere (PV = medição da 00005) |
| FE-3 | EV + 0,05×168.000; AC + 3.000 | **6.456.600,00**; **6.899.900,00**; SPI **0,889431**; CPI **0,935753**; EAC **20.425.268,52** | confere |
| C-2 / LB-2 (estimativa do arquiteto) | concluídas 4.665.000; 302: 14/09→05/11 = 37 d.u., até 23/10 = 29; 104: 05/10→05/11 = 22 d.u., até 23/10 = 14 | 1.724.324,3243 + 106.909,0909 → **6.496.233,42**; SPI **0,992606** | **plausível**, com `moverRestante` = true (padrão, `cpm.ts:30`); medição oficial na tarefa 1. Ver a ressalva da E-4 |
| C-7 (estimativa) | 302: saldo round(36×480×0,22) = 3.802 min = 7,92 d; 104: 12×480×0,6 = 3.456 min = 7,2 d; dias úteis depois de 23/10: 26–30/10 (5) + 03, 04, 05/11 → o 8º é 05/11 | **2026-11-05** para os dois | **plausível**; com `moverRestante` = false, o 302 terminaria em 04/11 |
| LB-3 | término da LB1 = término previsto | 0 d.u. pelo plano; **+16 d.u. com a E-1** | muda com a E-1 |
| LB-4 | ver pergunta 3 | PV 7.259.250,00; com a E-2: BAC 18.993.000,00, EAC 20.314.633,80; variante 104: EV 6.381.000,00, CPI 0,925198 | conta confere; caso incompleto (E-2) |
| LB-5 | 6.448.200 + 0,40×12.000 | LB0 **6.453.000,00**; LB2 **6.448.200,00** | confere (G6 = a) |
| CS-1 | 05–30/01 = 20 d.u.; até 09, 16 e 23/01 = 5, 10 e 15 | PV 25.000 / 50.000 / 75.000; fev/26 PV 100.000 | confere. O ponto "fev/26" existe porque a previsão de A termina em fevereiro (saldo de 8 d a partir de 26/01) |
| CS-2 | 05/01–27/02 = 40 d.u.; F1 = 15; fim de jan = 20; F2 = 25; entre F1 e F2: 5 de 10 d.u. (8 de 14 corridos) | PV 75.000 / 100.000 / 125.000; EV 65.000,00, AC 69.000,00 (corridos 67.142,857143 / 71.428,571429) | confere; exatamente 3 pontos (E-11) |
| TE-1 | 6,8 mi/7,6 mi; 6,8 mi/7,25 mi | **0,894737**; **0,937931** | confere |
| DF-1 | B: 05/11 → 10/11 = 06/11 (sex), 09/11, 10/11; EV Fa = 10.000 + 30.000; Fb = 25.000 + 30.000 | **+3 d.u.**; ΔEV A **+15.000**; EV e AC 40.000 → 55.000 | confere, **desde que D entre com 0% e custo 0** (o caso não diz: E-10). A regra de d.u. do DF-1 (contar os dias úteis depois do término anterior até o novo, inclusive) é a mesma do `workingVariance` e do "+16 d.u." |

**Ressalva de domínio sobre a C-2 (E-4).**

- **O cálculo do CronoAI.** O PV usa uma fração **linear entre o início e o término** da LB. Para uma LB salva no meio da obra, com a tarefa em andamento interrompida na data de status (a parte feita fica antes e o saldo começa em 26/10), o vão inclui a interrupção. Por isso o CronoAI dá SPI 0,992606 no próprio dia em que a LB1 foi salva: o engenheiro "replaneja e já está atrasado".
- **O que o MS Project faria, pelo que conheço.** Distribui o custo da LB pela distribuição no tempo da tarefa (custo fixo rateado, sem a interrupção):
  - 302: BCWS em 23/10 = 2.200.000 × 28,08/36 = 1.716.000;
  - 104: 168.000 × 4,8/12 = 67.200;
  - os dois iguais ao EV, ou seja, **SPI ≈ 1,00**.
  **Não tenho certeza** de como o MS Project distribui a parte já executada antes da interrupção: **confirmar no MS Project real (M-4)**.
- **Como tratar.** Exige a distribuição no tempo da LB (`TimephasedData`, RF-04.8, fora do escopo). Recomendação: aceitar neste ciclo como **regra do CronoAI**, rotular o número da C-2/LB-2 como tal no teste e na `calculo-precisao.md`, e pôr na tela da LB uma nota: "o PV é distribuído linearmente entre o início e o término da linha de base".

---

## Validações com outras áreas (registrar; não decido por elas)

| Tema | Área | Por quê |
|---|---|---|
| LB do valor agregado × LB das variações (E-1); atualização do texto do RF-04.5 | **Planejamento/Controle** (dono da SPEC-04) | A recomendação segue o MS Project e contraria a spec |
| Tarefa sem LB n com EV e BAC zero e AC contando (E-2); custo da LB n = `bac` do momento; inclusão de escopo com a LB ativa (E-7) | **Planejamento/Controle** e **Orçamento/Controladoria** | Define o que é "orçamento" depois de aditivos e como o desvio de custo aparece |
| Rotina de fechamento (mensal × semanal, data de corte, quem fecha), retificação de datas reais, avisos da E-8 | **Planejamento/Controle** | Antes do piloto (SPEC-13) |
| Autor em texto livre (nome de pessoa) no fechamento, na LB e no JSON exportado | **Jurídico** (LGPD, [Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)) | Dado pessoal; finalidade, retenção e exportação |
| Valor do fechamento "imutável" como prova: é um registro gerencial **local**, apagável pelo usuário, e não substitui o boletim de medição contratual (em obra pública, a medição segue o contrato e a [Lei 14.133/2021](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm)) | **Jurídico** | Evitar que a tela sugira valor probatório. Texto sugerido: "registro gerencial; não substitui a medição contratual" |
| Arredondamento e exibição de R$ nos totais gravados (sem arredondar no registro) | **Orçamento/Custos** | Já pendente na `calculo-precisao.md` |

---

## Emendas propostas ao plano (seção 17)

**Obrigatórias antes da tarefa 2:**

- **E-1 (G5, provisório → resolvido pela regra do próprio gate).**
  - A "LB ativa" passa a ser a **LB do valor agregado**. A projeção da D-6 vale só para os derivados de custo e de valor agregado: `computeEvm`, `computePackageEvm`, `computeSCurve` (PV), `evmForecast`/IEAC(t), tendência e diagnóstico (só nas frases de valor agregado).
  - `analyzeDelay`, `finishVarianceDays`, cenários (meta de recuperação), DLP (`supplies.ts:96`), Gantt e coluna da EAP continuam com `state.tasks` (LB0).
  - Textos a refazer: D-6, D-7, §04 "Efeito em quem consome", AC-3 ("a LB do valor agregado vale para PV, EV, BAC, SPI, CPI, EAC e a Curva S; o atraso e as variações medem contra a LB0, como no MS Project"), LB-3 (atraso **+16 d.u.** com a LB1 ativa; entrega 2027-06-23) e a mensagem do commit do E1.
  - Rótulo na tela: "LB do valor agregado: LBn".
  - Pendência: atualizar o RF-04.5 com Planejamento/Controle; M-4.
- **E-2 (G6 confirmado; D-8 completada).**
  - Tarefa sem custo na LB n: BAC, PV e EV = 0; AC conta.
  - LB-4 com os números da pergunta 3 (BAC 18.993.000,00; EAC 20.314.633,80; variante 104: EV 6.381.000,00, CPI 0,925198).
  - Aviso com "PV, EV e orçamento (BAC)".
  - Na `divida-conhecida.md`: "custo da LB0 = `bac` vivo (no MS Project ficaria congelado); as LB1–10 congelam o custo".
- **E-3 (D-10, fechamento).**
  - `linhaBaseSalvaEm` no cabeçalho;
  - `pv` na tupla do detalhe (12 posições, ordem fixada pela `versaoFormato: 1`);
  - S-2 e P-12 ajustados;
  - FE-1 com o PV do 302 e do 104 na tupla (medido na tarefa 1).
- **E-4 (C-2/LB-2, documentação).** O PV da LB salva no meio da obra é linear entre o início e o término e não enxerga a interrupção da tarefa em andamento. Isso vai ao teste (nome do caso: "regra do CronoAI"), à `calculo-precisao.md` e à nota da tela. A paridade com o MS Project (SPI ≈ 1,00) fica em M-4. Não muda código.

**Recomendadas (opinião; o orquestrador decide):**

- **E-5:** retificação com aviso de incoerência com os fechamentos vizinhos (EV acima do seguinte; % acima do seguinte) e a frase "a retificação não altera a obra atual". Teste com número.
- **E-6:** rollup da LB n no resumo com a **duração** (dias úteis do calendário padrão entre o menor início e o maior término × `minutosPorDia`, como a `Duration` do resumo, `msProjectXmlParser.ts:267-268`). A LB0 do resumo, que hoje sai com `Duration` 0 (`:345`), vira dívida separada para não quebrar a C-4. M-4.
- **E-7:** inclusão de escopo (`useProjectStore.ts:1075`, `:1266`) com a LB do valor agregado ≠ 0: gravar também a LB ativa, com o mesmo critério da LB0 de hoje e entrada no log. A alternativa é deixar sem e cair no aviso da E-2. Decisão de Planejamento/Controle.
- **E-8:** ao fechar, avisar sobre relatos de campo pendentes e sobre a data de status posterior a hoje (sem bloquear).
- **E-9:** traço do EV/AC interpolado diferente do traço da tendência; nota "índices calculados contra a LB vigente em cada fechamento". A série de PV da LB0 como referência quando a LB do valor agregado ≠ 0 é opcional.
- **E-10:** DF-1 com os valores de D explícitos (por exemplo, 0%, custo 0, BAC 20.000), para os totais 55.000 / 55.000 ficarem fixados.
- **E-11:** CS-2 com exatamente 3 pontos e a nota de que a curva não mostra os 200.000 da LB (comportamento da base; não corrigir de passagem).
- **E-12:** aviso na exportação de que o trabalho das LBs não volta ao `.xml`; preservação opaca do `Work` (LB0–10) fica para o ciclo 00010.

## Recomendação final para os gates provisórios

- **G5 → opção (b), seguir o MS Project**, pela regra que o próprio gate do orquestrador já previa. A LB ativa vira a "LB do valor agregado" (PV, EV, BAC, índices, Curva S, previsão por SPI); atraso, variações, cenários, DLP, Gantt e EAP continuam na LB0. Confiança alta, com M-4 `NOT_RUN`. O RF-04.5 precisa da atualização feita por Planejamento/Controle.
- **G6 → opção (a), confirmada**: custo gravado na LB n para PV, EV e BAC, completada pela E-2 (tarefa sem custo na LB n: BAC, PV e EV zero; AC conta). M-4 `NOT_RUN`.

CONHECIMENTO NOVO:
- No MS Project, a LB escolhida para o valor agregado (`BaselineForEarnedValue`) afeta só os campos de valor agregado. Variação de início, de término, de duração, de trabalho e de custo, e as barras do Gantt de Controle, comparam sempre com a LB0. Alta confiança; M-4 — linhas de base, G5.
- Sem custo na linha de base do valor agregado, o MS Project zera BCWS, BCWP e BAC da tarefa, e o ACWP continua contando: o CPI cai. A projeção precisa reproduzir isso de forma explícita, e não por acaso — EVM com LB n.
- O PV linear entre o início e o término da LB não enxerga a interrupção da tarefa em andamento. Uma LB salva no meio da obra já nasce com SPI < 1 no CronoAI (0,992606 no Aurora), enquanto o MS Project, pela distribuição no tempo, daria cerca de 1,00 — LB salva pelo previsto; M-4.
- `s.duracaoMin` do cronograma é o vão em minutos úteis entre o início e o término (`cpm.ts:434`), e não a duração da tarefa. Salvar a LB de uma tarefa interrompida grava uma duração maior que a da tarefa (o MS Project grava a Duração) — duração da LB.
- O corpus de 134 MSPDI (2002–2019) não tem nenhum elemento com a data de gravação de LB; a única data de gravação é `LastSaved`, a do arquivo. Nome, motivo e data da LB só viajam fora do `.xml` — MSPDI, LB1–10.
- A LB0 de resumo é exportada com `Duration` 0 (`msProjectXmlParser.ts:345`), e não com a duração do resumo — exportação MSPDI, dívida.
- O custo da LB0 é o `bac` vivo (editar o `bac` muda o PV e o EV), enquanto as LB1–10 do plano congelam o custo: assimetria a declarar — G6.
