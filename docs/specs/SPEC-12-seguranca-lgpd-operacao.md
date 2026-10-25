# SPEC-12 — Segurança, LGPD e operação

| Campo | Valor |
|---|---|
| Status | Parte 1 iniciada (headers, imagem não root, CodeQL, Dependabot) |
| Fase | 0 (parte 1), 2–4 (parte 2) |
| Prioridade | Alta |
| Esforço | M |
| Depende de | SPEC-00, SPEC-01 |
| Validar com | **Segurança da Informação**, **Jurídico (LGPD)**, **Infraestrutura** |

## 1. Contexto
Quando o sistema for para um servidor, ele vai guardar dados de obra (custos, contratos) e **dados pessoais** de trabalhadores: nome, telefone, voz e imagem. A base legal e os prazos de retenção precisam ser definidos pelo Jurídico, conforme a [LGPD (Lei 13.709/2018)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

## 2. Requisitos — parte 1 (front e pipeline, já iniciados)
- **RF-12.1** Nginx com `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e `X-Frame-Options`/`frame-ancestors` ([nginx.conf](../../docker/nginx.conf)).
- **RF-12.2** Imagem sem root, sem código-fonte e com *healthcheck*.
- **RF-12.3** CodeQL (SAST) e Dependabot ativos; `npm audit` com nível `high` bloqueando o CI.
- **RF-12.4** Nada de segredos no repositório: variáveis `VITE_*` são **públicas** (vão no bundle) e não podem conter chaves.

## 3. Requisitos — parte 2 (com backend)
- **RF-12.5** [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) nível 2 como checklist de aceite: validação de entrada, consultas parametrizadas, tratamento de erros sem expor detalhes internos, *rate limiting*, proteção de upload (tipo, tamanho, XXE em XML).
- **RF-12.6** Segredos em cofre (definido pela Infra), injetados em tempo de execução; rotação documentada.
- **RF-12.7** Criptografia em trânsito (TLS) e em repouso (banco e arquivos).
- **RF-12.8** Backups diários, retenção e teste de restauração trimestral (RPO/RTO definidos com a Infra).
- **RF-12.9** Observabilidade: logs estruturados sem dados pessoais, métricas (latência, erros, tempo de CPM) e alertas.
- **RF-12.10** LGPD:
  - inventário de dados pessoais;
  - base legal definida pelo Jurídico;
  - aviso aos encarregados no cadastro;
  - prazos de retenção e descarte automático;
  - atendimento a pedidos do titular (acesso e exclusão);
  - minimização no envio a IA (SPEC-08).
- **RF-12.11** Teste de intrusão antes do piloto com dados reais. **(recomendação)**

## 4. Critérios de aceite
- [ ] Scan de headers (ex.: Mozilla Observatory, em ambiente aprovado) sem falhas críticas.
- [ ] CodeQL sem alertas *high/critical* abertos na branch principal.
- [ ] Relatório de impacto (RIPD) aprovado pelo Jurídico antes de coletar áudio e fotos reais.
- [ ] Restauração de backup testada e documentada.
