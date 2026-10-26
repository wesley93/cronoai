# SPEC-14 — Portfólio multiobra (gestores e construtoras)

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 1 (multiobra e portfólio no front, com obras locais) · 2 (consolidado por empresa, com backend) |
| Prioridade | Alta |
| Esforço | M (Fase 1) + M (Fase 2) |
| Depende de | Fase 1: nada · Fase 2: SPEC-01, SPEC-02 |
| Validar com | Jurídico (uso por várias empresas: termos de uso, LGPD controlador × operador), Segurança (isolamento entre empresas) |

## 1. Problema
O CronoAI foi desenhado para uma obra só ([useProjectStore.ts](../../src/stores/useProjectStore.ts) guarda um estado, com `STORAGE_KEY='cronoai-state-v1'`). O público real é outro:
- **construtoras** com várias obras simultâneas, em estados diferentes;
- **gestores de portfólio** que acompanham obras de vários engenheiros;
- **engenheiros** que tocam várias obras e frentes ao mesmo tempo.

Hoje não dá para comparar obras, ver onde está o risco do portfólio nem trocar de obra.

## 2. Objetivo
Cada usuário trabalha com várias obras, troca a obra ativa em um clique, e o gestor tem uma visão consolidada: quais obras atrasam, quais estouram custo, quais compras vão parar alguma frente.

## 3. Requisitos funcionais
**Fase 1 — front (obras locais no navegador)**
- **RF-14.1 Multiobra:** lista de obras, obra ativa, criar (em branco ou a partir de `.xml` do MS Project), duplicar e excluir obra (com confirmação). Todos os módulos operam sobre a obra ativa.
- **RF-14.2 Migração:** o estado salvo de uma obra (`cronoai-state-v1`) vira a primeira obra da lista, sem perda (T4).
- **RF-14.3 Dados da obra:** nome, UF, município, engenheiro responsável (texto livre até a SPEC-02), data de status, tabela SINAPI (UF/regime/data-base, SPEC-07).
- **RF-14.4 Painel de portfólio:** tabela e cartões por obra com SPI, CPI, EAC × BAC, VAC, % físico × planejado, entrega prevista × linha de base (dias), nº de tarefas críticas atrasadas, compras críticas (DLP vencida) e restrições abertas. Ordenação e filtro por UF, responsável e situação.
- **RF-14.5 Consolidado:** totais de BAC, PV, EV, AC, SPI e CPI do portfólio (soma de PV/EV/AC, nunca média de índices) e mapa por UF.
- **RF-14.6 Alertas do portfólio:** obras com SPI ou CPI abaixo do limiar (configurável, ex.: 0,95), entrega com mais de N dias de atraso, compra atrasada que para frente crítica.

**Fase 2 — backend**
- **RF-14.7** Portfólio por empresa (SPEC-01 RF-01.1a), respeitando permissões: o engenheiro vê as suas obras e o gestor, a carteira (SPEC-02 RF-02.3).
- **RF-14.8** Carteiras (agrupamentos de obras por regional, cliente ou gestor) e atribuição de obra/frente a engenheiros. **Nota (ciclo 00014):** o MODELO de carteira (N:N com a obra; carteira arquivada não concede acesso) e a atribuição de OBRA a engenheiros pela API (administrador, ou gestor de portfólio dentro do próprio alcance) entram no 00014; criar carteiras e atribuir frentes pela API é do 00014b.
- **RF-14.9** Histórico do portfólio a partir dos snapshots (SPEC-04): evolução semanal de SPI/CPI consolidado e por obra.
- **RF-14.10** Exportação do relatório de portfólio (SPEC-11).

## 4. Requisitos não funcionais
- **RNF-14.1** Painel de portfólio com 50 obras de até 3.000 tarefas em menos de 2 s. Na Fase 1, o cálculo das obras não ativas pode usar o último resultado salvo (cache), recalculado sob demanda.
- **RNF-14.2** Limite de armazenamento local na Fase 1: avisar ao se aproximar da cota do `localStorage` e sugerir exportar/arquivar obras. A persistência real é a SPEC-01.
- **RNF-14.3** Nenhuma regra assume UF, empresa ou obra fixa no código.

## 5. Critérios de aceite
- [ ] Com o estado atual salvo, abrir a nova versão mostra o Edifício Aurora como 1ª obra, com os mesmos indicadores (teste de migração).
- [ ] Criar uma 2ª obra (ex.: em PE, importada de `.xml`), alternar entre as duas e ver cada módulo mostrar só a obra ativa.
- [ ] O consolidado de 2 obras confere com a soma de PV/EV/AC (SPI do portfólio = ΣEV ÷ ΣPV), com teste fixando os números.
- [ ] Na Fase 2: um usuário da empresa A não vê nenhuma obra da empresa B (teste automatizado na API).

## 6. Riscos
- **Mudança grande na store:** feita como primeiro entregável da Fase 1, antes de premissas e snapshots (que são por obra), com E2E cobrindo a troca de obra.
- **`localStorage`** comporta poucas obras grandes: é aceitável só no protótipo; a SPEC-01 resolve.
- **Uso por várias empresas** exige termos de uso e papéis de LGPD definidos pelo Jurídico antes de abrir para clientes.
