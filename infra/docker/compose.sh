#!/usr/bin/env bash
# Chama o docker compose do ambiente local lendo o `.env` da raiz do repositório, quando existir.
# Sem isso, o compose procura o `.env` ao lado do compose.yml (infra/docker) e ignora o da raiz.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
argumentos=(-f "${raiz}/infra/docker/compose.yml")
if [[ -f "${raiz}/.env" ]]; then
  argumentos=(--env-file "${raiz}/.env" "${argumentos[@]}")
fi
exec docker compose "${argumentos[@]}" "$@"
