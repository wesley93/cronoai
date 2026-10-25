# syntax=docker/dockerfile:1
# CronoAI — imagem de produção: build com Node e entrega estática com Nginx sem root.

# ---------- Etapa 1: dependências e build ----------
# Imagens fixadas por versão + digest (Dependabot atualiza ambos)
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app

# Instala dependências pelo lockfile (camada reaproveitada enquanto package*.json não mudar)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Type-check + build de produção (falha a imagem se houver erro de tipos)
RUN npm run build

# ---------- Etapa 2: servidor estático ----------
# nginx-unprivileged (linha stable) roda como usuário 101 e escuta na porta 8080
FROM nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS runtime

LABEL org.opencontainers.image.title="CronoAI" \
      org.opencontainers.image.description="Copiloto de Planejamento de Obras & MS Project" \
      org.opencontainers.image.source="https://github.com/wesley93/cronoai"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
