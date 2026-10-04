# syntax=docker/dockerfile:1.7
# Imagem padrão das apps Node do monorepo (HU02, ADR-010): api, worker e web.
# Uso (a partir da raiz do repositório):
#   docker build -f infra/docker/node-app.Dockerfile \
#     --build-arg APP=@pz/api --build-arg PORTA=3000 -t pz-api .
# A app precisa: script `build` gerando `dist/`, `start` no package.json e os endpoints
# /health/live e /health/ready (entram com as apps na HU04 e na HU23).

ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Dependências baixadas só a partir do lockfile: camada reaproveitada enquanto ele não muda.
FROM base AS dependencias
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile

FROM dependencias AS build
ARG APP
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --ignore-scripts \
 && pnpm turbo run build --filter="${APP}..." \
 && pnpm --filter="${APP}" deploy --prod --legacy /saida

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG PORTA=3000
ENV NODE_ENV=production \
    PORT=${PORTA} \
    TZ=UTC
WORKDIR /app
# Usuário não-root "node" da imagem oficial, referenciado pelo UID numérico.
COPY --from=build --chown=1000:1000 /saida ./
USER 1000:1000
EXPOSE ${PORTA}
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
