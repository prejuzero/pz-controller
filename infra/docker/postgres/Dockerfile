# PostgreSQL 16 de desenvolvimento com as extensões previstas no ADR-010 e no ADR-016.
FROM postgres:16.15-bookworm

# pg_partman (partições de auditoria e publicações) e pgvector (RAG e busca semântica, F2),
# instalados do repositório oficial do PostgreSQL (PGDG), já configurado na imagem base.
# O PGDG mantém só a versão mais recente de cada pacote: fixar a versão quebraria o build.
# A reprodutibilidade vem da imagem base fixada por tag; uso exclusivo em desenvolvimento.
# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-16-partman postgresql-16-pgvector \
  && rm -rf /var/lib/apt/lists/*

COPY init/ /docker-entrypoint-initdb.d/

HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
  CMD ["sh", "-c", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\""]
