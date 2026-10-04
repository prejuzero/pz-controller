#!/bin/sh
# Cria os buckets locais de forma idempotente (HU02). Executado pelo serviço armazenamento-init.
set -eu
ENDPOINT="http://armazenamento:9000"

criar() {
  bucket="$1"; shift
  if aws --endpoint-url "$ENDPOINT" s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    echo "bucket já existe: $bucket"
  else
    aws --endpoint-url "$ENDPOINT" s3api create-bucket --bucket "$bucket" "$@"
    echo "bucket criado: $bucket"
  fi
}

criar pz-arquivos
criar pz-relatorios
# Cópia WORM da trilha de auditoria (ADR-006): object lock precisa ser habilitado na criação.
criar pz-auditoria-worm --object-lock-enabled-for-bucket
