# CronoAI — Specs para uso em obra real

Este diretório reúne as especificações para levar o CronoAI do protótipo atual a uma ferramenta confiável no dia a dia de uma obra. O protótipo roda só no navegador, com dados de exemplo e IA simulada.

> **Como ler:** cada spec traz problema, escopo, requisitos (RF/RNF), critérios de aceite, riscos e plano de entrega.
> Itens marcados **(recomendação)** são opinião técnica, não exigência. Itens com impacto jurídico, de segurança ou de RH trazem a área que **precisa validar** antes de seguir.

## Estado atual (out/2026)

| Área | Hoje | Lacuna para obra real |
|---|---|---|
| Dados | `localStorage` do navegador ([useProjectStore.ts](../../src/stores/useProjectStore.ts)) | Sem servidor, sem compartilhar entre usuários, sem backup |
| Acesso | Sem login | Qualquer um aprova apontamento; sem trilha por usuário |
| Cronograma | CPM próprio ([cpm.ts](../../src/lib/cpm.ts)) FS/SS/FF/SF, calendário único | Sem calendário por tarefa, recursos, nivelamento ou paridade comprovada com o MS Project |
| MS Project | `.xml` MSPDI com validação estrutural ([msProjectXmlParser.ts](../../src/lib/msProjectXmlParser.ts)) | Nunca aberto num MS Project real; não lê `.mpp` |
| EVM | Indicadores certos na data de status ([evm.ts](../../src/lib/evm.ts)) | Histórico da Curva S reconstruído linearmente; custo real digitado |
| SINAPI | 12 composições ilustrativas ([sinapiCatalog.ts](../../src/data/sinapiCatalog.ts)) | Falta a tabela oficial por UF e data-base |
| Campo | IA heurística local ([fieldAi.ts](../../src/lib/fieldAi.ts)), feed simulado | Sem WhatsApp, transcrição ou visão real |
| Premissas | Fixas no código (indireto, taxas, fatores) | Precisam ser configuráveis por obra |
| Engenharia | Testes de lógica (Vitest), build | Sem lint/CI/CD/E2E até a SPEC-00 |

## Índice

| ID | Spec | Fase | Prioridade |
|---|---|---|---|
| [SPEC-00](SPEC-00-fundacao-engenharia.md) | Fundação de engenharia: Git, CI/CD, Docker, qualidade | 0 | Alta |
| [SPEC-01](SPEC-01-arquitetura-backend.md) | Arquitetura alvo, backend, banco e multi-obra | 2 | Alta |
| [SPEC-02](SPEC-02-identidade-perfis-auditoria.md) | Identidade, perfis de acesso e trilha de auditoria | 2 | Alta |
| [SPEC-03](SPEC-03-premissas-calendarios.md) | Premissas da obra e calendários | 1 | Alta |
| [SPEC-04](SPEC-04-data-de-status-snapshots.md) | Data de status, snapshots e linhas de base | 1 | Alta |
| [SPEC-05](SPEC-05-motor-cronograma.md) | Motor de cronograma com paridade MS Project | 1–3 | Alta |
| [SPEC-06](SPEC-06-integracao-ms-project.md) | Integração MS Project (`.xml` e `.mpp`) | 1–3 | Alta |
| [SPEC-07](SPEC-07-sinapi-oficial.md) | Tabela SINAPI oficial e composições | 1 | Média |
| [SPEC-08](SPEC-08-apontamento-campo.md) | Apontamento de campo: WhatsApp, transcrição e IA | 3 | Média |
| [SPEC-09](SPEC-09-suprimentos.md) | Suprimentos integrado a compras/ERP | 3 | Média |
| [SPEC-10](SPEC-10-evm-medicao.md) | EVM com medição e custo real confiáveis | 1–3 | Alta |
| [SPEC-11](SPEC-11-relatorios-notificacoes.md) | Relatórios e notificações | 4 | Média |
| [SPEC-12](SPEC-12-seguranca-lgpd-operacao.md) | Segurança, LGPD e operação | 0–4 | Alta |
| [SPEC-13](SPEC-13-piloto-validacao.md) | Piloto e validação em obra | 4 | Alta |

## Roadmap por fases (recomendação)

```text
Fase 0  Fundação ............ SPEC-00, SPEC-12 (parte 1)           ✓ iniciada neste ciclo (Docker + CI)
Fase 1  Números confiáveis .. SPEC-03, 04, 05 (parte 1), 06 (.xml), 07, 10 (parte 1)
Fase 2  Multiusuário ........ SPEC-01, 02, 12 (parte 2)            ← exige backend e aval da Infra/Segurança
Fase 3  Integrações ......... SPEC-06 (.mpp), 08, 09, 10 (parte 2) ← exige aval de Segurança/Jurídico
Fase 4  Operação ............ SPEC-11, 13                          ← piloto em 1 obra antes de escalar
```

A Fase 1 entra antes do backend de propósito: ela torna os números corretos (premissas, histórico, paridade com o MS Project) e funciona no protótipo atual. A Fase 2 move para o servidor o que já foi validado.

## Definição de "preciso para obra real"

O CronoAI só substitui planilhas e conferências manuais quando cumprir, no piloto (SPEC-13):

1. **Datas:** para o mesmo `.xml`, início e término de 100% das tarefas iguais ao MS Project (tolerância 0 dia útil) em 5 cronogramas reais.
2. **EVM:** PV, EV, AC, SPI e CPI iguais à planilha de controle da obra (tolerância ±0,5%) em 4 datas de status seguidas.
3. **Curva S:** o histórico vem de snapshots gravados, não de reconstrução linear.
4. **Apontamentos:** ≥ 90% dos relatos de campo associados à tarefa certa na 1ª sugestão (medido nas aprovações do engenheiro).
5. **Rastreabilidade:** toda mudança de avanço, custo, vínculo ou linha de base tem autor, data e origem.
6. **Ida e volta com o MS Project:** exportar, abrir no MS Project, salvar e reimportar sem perda de UID, vínculo, % concluído, datas reais ou linha de base.

## Validações obrigatórias com outras áreas

| Tema | Área | Specs |
|---|---|---|
| Publicação/hospedagem, ambientes, domínio, banco gerenciado | **Infraestrutura** | 00, 01, 12 |
| Uso do GitHub para este código (visibilidade do repositório, Actions, registro de imagens) | **Infraestrutura + Segurança** | 00 |
| Fornecedores de IA/transcrição/WhatsApp, retenção de áudio e foto | **Segurança da Informação + Jurídico** | 08, 12 |
| Dados pessoais de trabalhadores (nome, telefone, voz, imagem) | **Jurídico (LGPD) + RH** | 02, 08, 12 |
| Hora extra, adicional e compensação | **RH + Jurídico** | 03 |
| Integração com ERP/compras | **TI corporativa / dono do ERP** | 09, 10 |

## Decisões em aberto

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | Stack do backend | .NET 8 ou Python/FastAPI (ambos citados no `SPEC.md`) | .NET 8: MPXJ.Net nativo para `.mpp` e alinhamento com a stack aprovada da Sophia (confirmar com Infra) |
| D2 | Front | Manter Vue 3 ou migrar | Manter Vue 3 (já validado); revisar se a Infra exigir React |
| D3 | Repositório | GitHub (atual) ou Azure DevOps (padrão interno citado nos guias da Sophia) | Confirmar com Infra/Segurança; se ficar no GitHub, repositório **privado** |
| D4 | Provedor de IA | Modelo de linguagem corporativo aprovado × modelo local | Só o que Segurança aprovar; manter o motor local como alternativa |
