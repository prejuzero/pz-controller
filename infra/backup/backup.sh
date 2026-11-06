#!/usr/bin/env bash
# Backup local (HU37, PZ-221; validação local, sem AWS): banco (pg_dump, formato custom) e os
# buckets do S3 local (RustFS), com manifesto SHA-256 e retenção dos N mais recentes.
# Uso: pnpm backup   (BACKUP_DIR=./backups, BACKUP_RETENCAO=7)
# Os backups contêm dados do banco local: ficam fora do git (.gitignore) e da máquina não saem.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$raiz"
compose=infra/docker/compose.sh
base="${BACKUP_DIR:-$raiz/backups}"
retencao="${BACKUP_RETENCAO:-7}"
destino="$base/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$destino/arquivos"
inicio=$(date +%s)

echo "Banco → $destino/banco.dump"
$compose exec -T postgres pg_dump -U pz_dev -d prejuzero -Fc >"$destino/banco.dump"

echo "Buckets → $destino/arquivos"
$compose run --rm --no-deps -v "$destino/arquivos:/backup" --entrypoint sh armazenamento-init -c '
  for b in pz-arquivos pz-relatorios pz-auditoria-worm; do
    aws --endpoint-url http://armazenamento:9000 s3 sync "s3://$b" "/backup/$b" --only-show-errors
  done'

(cd "$destino" && find . -type f ! -name MANIFESTO.sha256 -print0 | sort -z | xargs -0 shasum -a 256 >MANIFESTO.sha256)
echo "Backup concluído em $(($(date +%s) - inicio)) s: $destino"

# Retenção: mantém os N mais recentes (nomes em UTC ordenam por data).
ls -1d "$base"/*/ 2>/dev/null | sort -r | tail -n +"$((retencao + 1))" | while read -r antigo; do
  echo "Retenção: removendo $antigo"
  rm -rf "$antigo"
done
