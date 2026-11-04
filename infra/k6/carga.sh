#!/usr/bin/env bash
# Teste de carga (HU40, PZ-231): massa sintética FICTÍCIA no banco local, sessões prontas no
# Redis e o cenário k6 do portal contra a API. Os limites do k6 são os SLOs (Padrões de
# engenharia); passar de um deles reprova a execução.
# Pré-requisito: pilha com as apps e o limite global por IP alto (o k6 sai de um IP só):
#   LIMITE_POR_IP_POR_MINUTO=10000000 pnpm infra:up:apps
# Uso: pnpm carga                            (1.000 escritórios, 500 usuários, 3 min)
#      CARGA_TENANTS=100 CARGA_VUS=50 CARGA_DURACAO=30s pnpm carga
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
tenants="${CARGA_TENANTS:-1000}"
alvo="${CARGA_ALVO:-http://localhost:3000}"
# Versão fixa do k6; atualizar com revisão (cadeia de suprimentos).
imagem="${K6_IMAGEM:-grafana/k6:1.4.2}"
saida="$raiz/infra/k6/.relatorio"
mkdir -p "$saida"
chmod 777 "$saida"
compose() { "$raiz/infra/docker/compose.sh" "$@"; }

echo "Massa sintética: $tenants escritórios"
# Superusuário do ambiente local: a massa grava em tabelas de vários módulos e escritórios
# (publicações só a ingestão grava). Nunca rodar fora do ambiente local.
compose exec -T postgres psql -q -U "${POSTGRES_USER:-pz_dev}" -d prejuzero -v tenants="$tenants" <"$raiz/infra/k6/massa.sql"

# Sessões no formato do SessoesRedis (chave = SHA-256 do token), válidas por 12 h. O token é
# conhecido do cenário (cargak6 + número + sufixo) e só existe no ambiente local.
echo "Sessões no Redis"
compose exec -T postgres psql -At -U "${POSTGRES_USER:-pz_dev}" -d prejuzero -c "
  SELECT 'SET pz:sessao:' || encode(sha256(convert_to('cargak6' || lpad(n::text, 8, '0') || 'sessaoficticia', 'UTF8')), 'hex')
    || ' ''' || json_build_object(
         'id', overlay(overlay(md5('carga-sessao-' || n) PLACING '7' FROM 13) PLACING '8' FROM 17)::uuid, 'usuarioId', overlay(overlay(md5('carga-usuario-' || n) PLACING '7' FROM 13) PLACING '8' FROM 17)::uuid,
         'tenantId', overlay(overlay(md5('carga-tenant-' || n) PLACING '7' FROM 13) PLACING '8' FROM 17)::uuid, 'nivel', 'completo', 'segundoFatorAtivo', true,
         'criadaEm', (extract(epoch FROM now()) * 1000)::bigint,
         'ultimoUso', (extract(epoch FROM now()) * 1000)::bigint)::text
    || ''' PX 43200000'
  FROM generate_series(1, $tenants) AS n" | compose exec -T redis redis-cli >/dev/null

echo "k6 contra $alvo"
docker run --rm --network host -v "$raiz/infra/k6":/carga -v "$saida":/saida \
  -e CARGA_ALVO="$alvo" -e CARGA_TENANTS="$tenants" \
  -e CARGA_VUS="${CARGA_VUS:-500}" -e CARGA_DURACAO="${CARGA_DURACAO:-3m}" \
  "$imagem" run --summary-export /saida/resumo.json /carga/portal.js
