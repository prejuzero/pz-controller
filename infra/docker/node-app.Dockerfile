# syntax=docker/dockerfile:1.7
# Imagem padrão das apps Node do monorepo (HU02, ADR-010): api, worker e web.
# Uso (a partir da raiz do repositório):
#   docker build -f infra/docker/node-app.Dockerfile \
#     --build-arg APP=@pz/api --build-arg PORTA=3000 \
#     --build-arg VERSAO=$(git rev-parse --short HEAD) --build-arg REVISAO=$(git rev-parse HEAD) \
#     -t pz-api .
# A app precisa: script `build` gerando `dist/main.js` e `dist/instrumentacao.js` (pz-build-app)
# e os endpoints /health/live e /health/ready.

ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Dependências baixadas só a partir do lockfile (o pnpm fetch sempre o segue): camada
# reaproveitada enquanto ele não muda.
FROM base AS dependencias
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

FROM dependencias AS build
ARG APP
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --ignore-scripts \
 && pnpm turbo run build --filter="${APP}..." \
 && pnpm --filter="${APP}" deploy --prod --legacy --config.node-linker=hoisted /saida
# node-linker=hoisted: o dist empacota só o código @pz/*; as bibliotecas externas precisam
# estar resolvíveis a partir de /app/node_modules.

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG APP
ARG PORTA=3000
ARG VERSAO=dev
ARG REVISAO=desconhecida
# Etiquetas OCI: rastreiam a imagem até o commit (inventário, Trivy, auditoria de implantação).
LABEL org.opencontainers.image.title="${APP}" \
      org.opencontainers.image.vendor="PrejuZero" \
      org.opencontainers.image.source="https://github.com/prejuzero/pz-controller" \
      org.opencontainers.image.version="${VERSAO}" \
      org.opencontainers.image.revision="${REVISAO}" \
      org.opencontainers.image.licenses="UNLICENSED"
ENV NODE_ENV=production \
    PORT=${PORTA} \
    VERSAO=${VERSAO} \
    TZ=UTC
# Endurecimento: correções de segurança do Debian e remoção do npm e do corepack, que não
# são usados em execução e trazem dependências próprias (vulnerabilidades apontadas pelo Trivy).
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
    /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
# Usuário não-root "node" da imagem oficial, referenciado pelo UID numérico.
COPY --from=build --chown=1000:1000 /saida ./
USER 1000:1000
EXPOSE ${PORTA}
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
# A instrumentação (OpenTelemetry e Sentry) carrega antes da app, para alcançar HTTP e Fastify.
CMD ["node", "--enable-source-maps", "--import", "./dist/instrumentacao.js", "dist/main.js"]
