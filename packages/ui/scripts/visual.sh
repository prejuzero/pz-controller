#!/usr/bin/env bash
# Testes visuais no container de infra/docker/ui-visual.Dockerfile (o mesmo do CI). O código é
# copiado para dentro do container (sem node_modules do host) e só as capturas voltam. Sempre
# linux/amd64, a arquitetura do CI (em Mac com Apple Silicon roda emulado, mais devagar).
# Uso: pnpm --filter @pz/ui test:visual          (compara com as referências)
#      pnpm --filter @pz/ui test:visual:atualizar (regrava as referências; revise o diff)
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../../.." && pwd)"
versao="$(node -p "require('$raiz/packages/ui/node_modules/playwright/package.json').version")"
imagem="pz-ui-visual:${versao}"
docker build -q --platform linux/amd64 -t "$imagem" --build-arg "PLAYWRIGHT_VERSION=${versao}" \
  -f "$raiz/infra/docker/ui-visual.Dockerfile" "$raiz/infra/docker" >/dev/null
docker run --rm --platform linux/amd64 --ipc=host -v "$raiz":/src -v pz-ui-visual-pnpm:/pnpm/store "$imagem" bash -c '
  set -euo pipefail
  tar -C /src --exclude=node_modules --exclude=.git --exclude=.turbo --exclude=coverage --exclude=.vitest --exclude=storybook-static -cf - . | tar -xf -
  pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store --reporter=silent
  cd packages/ui
  status=0
  pnpm exec vitest run --project visual "$@" || status=$?
  # Devolve referências novas e, em falha, as diferenças para análise.
  find src -type d -name __screenshots__ | tar -cf - -T - | tar -C /src/packages/ui -xf -
  [ -d .vitest ] && cp -r .vitest /src/packages/ui/ || true
  exit $status
' -- "$@"
