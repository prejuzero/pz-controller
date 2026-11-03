#!/usr/bin/env bash
# DAST (HU37, PZ-220): OWASP ZAP contra a pilha local (pnpm infra:up:apps) ou outro alvo.
# Portal: varredura passiva (baseline). API: varredura pelo OpenAPI, sem sessão (o que exige
# login deve responder 401/403, nunca dados). Falha com alerta de nível FAIL (infra/dast/regras.tsv).
# Uso: pnpm dast                      (alvo http://localhost:3003)
#      DAST_ALVO=https://staging… pnpm dast
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
alvo="${DAST_ALVO:-http://localhost:3003}"
# Versão fixa do ZAP; atualizar com revisão (cadeia de suprimentos).
imagem="${ZAP_IMAGEM:-ghcr.io/zaproxy/zaproxy:stable}"
saida="$raiz/infra/dast/.relatorio"
mkdir -p "$saida"
chmod 777 "$saida"

regras_zap="$saida/regras.conf"
grep -v '^#' "$raiz/infra/dast/regras.tsv" | awk -F'\t' 'NF>=2 {print $1"\t"$2"\t("$3")"}' >"$regras_zap"

rodar() {
  docker run --rm --network host -v "$saida":/zap/wrk:rw "$imagem" "$@"
}

status=0
echo "ZAP baseline no portal: $alvo"
rodar zap-baseline.py -t "$alvo/entrar" -c regras.conf -r portal.html -J portal.json -I -j || status=$?
echo "ZAP na API pelo OpenAPI: $alvo/v1/openapi.json"
rodar zap-api-scan.py -t "$alvo/v1/openapi.json" -f openapi -c regras.conf -r api.html -J api.json -I || status=$?

# -I: avisos não falham; só as regras FAIL (código 1) e erros do ZAP (3) falham o script.
falhas=$(jq '[.site[].alerts[] | select(.riskcode == "3")] | length' "$saida/portal.json" "$saida/api.json" | awk '{s += $1} END {print s + 0}')
echo "Relatórios em $saida (portal.html, api.html). Alertas de risco alto: $falhas"
if [ "$status" -ne 0 ] || [ "$falhas" -gt 0 ]; then
  echo "DAST reprovado: veja os relatórios." >&2
  exit 1
fi
