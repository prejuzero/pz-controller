#!/usr/bin/env bash
# Restauração local (HU37, PZ-221) com o aceite do card: banco restaurado e a trilha de
# auditoria verificada da gênese ao fim (ADR-006). Por padrão restaura num banco separado
# (prejuzero_restaurado), sem tocar no banco em uso.
# Uso: pnpm restaurar [diretório do backup] [--banco nome] [--com-arquivos]
#   --banco prejuzero  substitui o banco em uso (pare api e worker antes; pede confirmação)
#   --com-arquivos     devolve também os buckets do S3 local (sobrescreve os objetos)
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$raiz"
compose=infra/docker/compose.sh
base="${BACKUP_DIR:-$raiz/backups}"
origem=""
banco="prejuzero_restaurado"
arquivos=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --banco) banco="$2"; shift 2 ;;
    --com-arquivos) arquivos=1; shift ;;
    *) origem="$1"; shift ;;
  esac
done
[[ -z "$origem" ]] && origem="$(ls -1d "$base"/*/ 2>/dev/null | sort -r | head -n 1)"
origem="${origem%/}"
[[ -f "$origem/banco.dump" ]] || { echo "Backup não encontrado: '$origem'" >&2; exit 2; }
[[ "$banco" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "Nome de banco inválido: $banco" >&2; exit 2; }

echo "Conferindo o manifesto de $origem"
(cd "$origem" && shasum -a 256 -c --quiet MANIFESTO.sha256)

if [[ "$banco" == "prejuzero" ]]; then
  read -r -p "Substituir o banco em uso (prejuzero)? Digite SUBSTITUIR: " resposta
  [[ "$resposta" == "SUBSTITUIR" ]] || { echo "Cancelado."; exit 1; }
fi

inicio=$(date +%s)
echo "Restaurando o banco em $banco"
$compose exec -T postgres psql -v ON_ERROR_STOP=1 -U pz_dev -d postgres -qc \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$banco' AND pid <> pg_backend_pid()" >/dev/null
$compose exec -T postgres dropdb -U pz_dev --if-exists "$banco"
$compose exec -T postgres createdb -U pz_dev -T template0 "$banco"
$compose exec -T postgres pg_restore -U pz_dev -d "$banco" --exit-on-error <"$origem/banco.dump"

if [[ "$arquivos" == 1 ]]; then
  echo "Restaurando os buckets"
  $compose run --rm --no-deps -v "$origem/arquivos:/backup:ro" --entrypoint sh armazenamento-init -c '
    for b in pz-arquivos pz-relatorios; do
      [ -d "/backup/$b" ] && aws --endpoint-url http://armazenamento:9000 s3 sync "/backup/$b" "s3://$b" --only-show-errors
    done
    echo "pz-auditoria-worm não é reescrito (object lock): a cópia fica no backup."'
fi

echo "Verificando a trilha de auditoria restaurada"
usuario_sistema="${PZ_SISTEMA_USUARIO:-pz_sistema}"
senha_sistema="${PZ_SISTEMA_SENHA:-pz_sistema_local}"
DATABASE_URL_SISTEMA="postgresql://${usuario_sistema}:${senha_sistema}@127.0.0.1:${POSTGRES_PORT:-5432}/${banco}" \
  pnpm --silent --filter @pz/worker exec tsx src/auditoria/verificar-cadeia-cli.ts
echo "Restauração concluída e verificada em $(($(date +%s) - inicio)) s (meta de RTO: 4 h)."
