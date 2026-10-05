#!/usr/bin/env bash
# Teste controlado dos alertas (HU03, PZ-88): injeta pz.fila.dlq = 1 por OTLP e espera o
# e-mail do alerta "Fila com jobs na DLQ" chegar ao Mailpit. Exige `pnpm infra:up:obs`.
# Uso: pnpm alertas:testar
set -euo pipefail

OTLP="${OTLP_HTTP_ENDPOINT:-http://127.0.0.1:4318}"
MAILPIT="${MAILPIT_URL:-http://127.0.0.1:8025}"
# Logo após subir o Grafana, o Alertmanager interno pode levar alguns minutos para a primeira
# notificação; com ele aquecido, o e-mail chega em menos de 1 minuto.
LIMITE_SEGUNDOS="${LIMITE_SEGUNDOS:-360}"
FILA="teste-alerta-$(date +%s)"

contar_emails() {
  curl -fsS "${MAILPIT}/api/v1/search?query=$(printf '%s' "subject:\"Fila com jobs na DLQ\" ${FILA}" | jq -sRr @uri)" |
    jq '.messages_count'
}

enviar_metrica() {
  local agora_ns
  agora_ns="$(date +%s)000000000"
  curl -fsS -o /dev/null -X POST "${OTLP}/v1/metrics" -H 'Content-Type: application/json' -d @- <<JSON
{"resourceMetrics":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"pz-teste-alertas"}}]},
 "scopeMetrics":[{"scope":{"name":"testar-alertas"},"metrics":[{"name":"pz.fila.dlq","gauge":{"dataPoints":[
  {"asInt":"1","timeUnixNano":"${agora_ns}","attributes":[{"key":"fila","value":{"stringValue":"${FILA}"}}]}]}}]}]}]}
JSON
}

command -v jq >/dev/null || { echo "jq não encontrado (brew install jq)" >&2; exit 2; }
curl -fsS -o /dev/null "${MAILPIT}/readyz" || { echo "Mailpit fora do ar: rode pnpm infra:up:obs" >&2; exit 2; }

echo "Injetando pz.fila.dlq=1 na fila ${FILA} e aguardando o e-mail (até ${LIMITE_SEGUNDOS}s)..."
inicio=$(date +%s)
while (($(date +%s) - inicio < LIMITE_SEGUNDOS)); do
  enviar_metrica
  if [[ "$(contar_emails)" -gt 0 ]]; then
    echo "OK: alerta disparado e e-mail recebido em $(($(date +%s) - inicio))s (veja ${MAILPIT})."
    exit 0
  fi
  sleep 10
done
echo "FALHA: nenhum e-mail de alerta em ${LIMITE_SEGUNDOS}s. Veja http://127.0.0.1:3001/alerting/list" >&2
exit 1
