# Ambiente fixo dos testes visuais do @pz/ui (HU23), usado localmente e no CI: as capturas de
# referência só são comparáveis se geradas com o mesmo navegador, fontes e sistema.
ARG NODE_VERSION=24.21.0
FROM node:${NODE_VERSION}-bookworm-slim
ARG PLAYWRIGHT_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN corepack enable \
 && npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium
WORKDIR /w
