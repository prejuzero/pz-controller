#!/usr/bin/env bash
# E2E do portal (PZ-167): sobe a pilha do compose (perfil apps), prepara o usuário de demonstração e
# roda o Playwright no container de infra/docker/ui-visual.Dockerfile (o mesmo dos testes visuais do
# @pz/ui), com rede do host para alcançar o portal em localhost:3003. Sempre linux/amd64, como no CI.
# Uso: pnpm e2e                 (compara com as capturas de referência)
#      pnpm e2e:atualizar       (regrava as referências; revise o diff)
#      pnpm e2e -- --grep smoke (argumentos extras vão para o Playwright)
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$raiz"

pnpm infra:up:apps
pnpm db:migrate
pnpm db:seed
# Só o banco local fictício: o 2FA do usuário de demonstração volta ao zero a cada execução, para que
# o smoke cubra a ativação obrigatória (HU06) e o segredo seja conhecido pelos testes.
infra/docker/compose.sh exec -T postgres psql -v ON_ERROR_STOP=1 -U pz_dev -d prejuzero -qc \
  "UPDATE usuario SET totp_segredo_cifrado = NULL, totp_ativo_em = NULL, totp_ultimo_passo = NULL,
   codigos_recuperacao = '{}' WHERE email = 'demonstracao@prejuzero.local'" >/dev/null
rm -rf apps/web/e2e/.sessao

versao="$(node -p "require('$raiz/apps/web/node_modules/@playwright/test/package.json').version")"
imagem="pz-ui-visual:${versao}"
docker build -q --platform linux/amd64 -t "$imagem" --build-arg "PLAYWRIGHT_VERSION=${versao}" \
  -f infra/docker/ui-visual.Dockerfile infra/docker >/dev/null
docker run --rm --platform linux/amd64 --ipc=host --network host -e E2E_URL -e SENHA_DEMONSTRACAO \
  -v "$raiz":/src -v pz-ui-visual-pnpm:/pnpm/store "$imagem" bash -c '
  set -euo pipefail
  tar -C /src --exclude=node_modules --exclude=.git --exclude=.turbo --exclude=coverage --exclude=.next \
    --exclude=storybook-static -cf - . | tar -xf -
  pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store --reporter=silent \
    --filter @pz/web...
  cd apps/web
  status=0
  pnpm exec playwright test "$@" || status=$?
  # Devolve referências novas e, em falha, o relatório com traces e diferenças.
  rm -rf /src/apps/web/e2e/.relatorio /src/apps/web/e2e/.resultados
  cp -r e2e/__screenshots__ e2e/.relatorio e2e/.resultados /src/apps/web/e2e/ 2>/dev/null || true
  exit $status
' -- "$@"
