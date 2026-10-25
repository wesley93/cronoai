# SPEC-11 — Relatórios e notificações

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 4 |
| Prioridade | Média |
| Esforço | M |
| Depende de | SPEC-01, SPEC-02, SPEC-04 |
| Validar com | Segurança (envio de e-mail/Teams com dados da obra) |

## 1. Problema
O diagnóstico executivo só pode ser copiado como texto. Não há relatório semanal em PDF nem avisos de DLP, restrições ou desvios.

## 2. Requisitos funcionais
- **RF-11.1 Relatório semanal em PDF** (gerado no backend) com: indicadores EVM, Curva S, tendência de SPI/CPI, caminho crítico, efeito dominó, cenários aplicados, restrições abertas, compras da semana e diagnóstico. Logotipo e dados da obra.
- **RF-11.2** Relatório gerado no fechamento da data de status (SPEC-04), arquivado e vinculado ao snapshot.
- **RF-11.3 Notificações** por e-mail e/ou Microsoft Teams (canal aprovado pela Segurança):
  - DLP a vencer ou vencida (Suprimentos);
  - relato pendente há mais de 24 h (engenheiro);
  - restrição de campo aberta há mais de 48 h;
  - nova tarefa no caminho crítico;
  - SPI/CPI abaixo do limiar.
- **RF-11.4** Preferências de notificação por usuário (canal, frequência, resumo diário).
- **RF-11.5** Exportação das tabelas (EAP, rede lógica, suprimentos, EVM por pacote) em `.xlsx`/CSV.

## 3. Critérios de aceite
- [ ] O PDF do fechamento reproduz os mesmos números da tela naquele snapshot.
- [ ] Um insumo com DLP em 7 dias gera exatamente 1 aviso por canal configurado.
