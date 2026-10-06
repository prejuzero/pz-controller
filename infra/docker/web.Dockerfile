# syntax=docker/dockerfile:1.7
# Imagem do portal web (HU23, PZ-292, ADR-010): variante do node-app.Dockerfile para o Next.js em
# modo standalone. Uso (a partir da raiz do repositório):
#   docker build -f infra/docker/web.Dockerfile \
#     --build-arg VERSAO=$(git rev-parse --short HEAD) --build-arg REVISAO=$(git rev-parse HEAD) \
#     -t pz-web .
# Configuração só em execução (API_URL); nada sensível entra no bundle do navegador: só variáveis
# NEXT_PUBLIC_* chegam a ele, e o build não recebe nenhuma.

ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS dependencias
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

FROM dependencias AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --ignore-scripts \
 && pnpm turbo run build --filter="@pz/web..." \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG VERSAO=dev
ARG REVISAO=desconhecida
LABEL org.opencontainers.image.title="@pz/web" \
      org.opencontainers.image.vendor="PrejuZero" \
      org.opencontainers.image.source="https://github.com/prejuzero/pz-controller" \
      org.opencontainers.image.version="${VERSAO}" \
      org.opencontainers.image.revision="${REVISAO}" \
      org.opencontainers.image.licenses="UNLICENSED"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001 \
    VERSAO=${VERSAO} \
    TZ=UTC
# Mesmo endurecimento da imagem padrão (node-app.Dockerfile).
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
    /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=build --chown=1000:1000 /repo/apps/web/.next/standalone ./
USER 1000:1000
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
