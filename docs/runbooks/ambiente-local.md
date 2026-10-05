# Runbook · Ambiente local

## Pré-requisitos

- Node.js 24 LTS e pnpm 12 (`corepack enable`)
- Runtime de containers compatível com Docker e Docker Compose v2: OrbStack (recomendado no Mac) ou Docker Desktop

## Subir e derrubar

| Comando               | O que faz                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm infra:up`       | Constrói a imagem do Postgres e sobe Postgres, Redis, armazenamento S3 (RustFS) e Mailpit, esperando todos ficarem saudáveis                          |
| `pnpm infra:up:obs`   | O mesmo, mais Grafana, Tempo, Loki, Prometheus e coletor OpenTelemetry                                                                                |
| `pnpm infra:up:apps`  | O mesmo, mais api (`:3000`) e worker (`:3002`) construídos com o Dockerfile de produção (perfil `apps`). Para desenvolver com recarga, use `pnpm dev` |
| `pnpm alertas:testar` | Com o perfil de observabilidade no ar, dispara um alerta controlado e confere o e-mail no Mailpit ([runbook](alertas.md))                             |
| `pnpm dev`            | `infra:up` + todas as apps em modo watch                                                                                                              |
| `pnpm infra:logs`     | Logs dos serviços                                                                                                                                     |
| `pnpm infra:down`     | Para tudo, mantendo os dados                                                                                                                          |
| `pnpm infra:reset`    | Apaga os volumes e sobe de novo, do zero                                                                                                              |

Não é preciso criar `.env`: o compose e as apps usam por padrão os valores de [.env.example](../../.env.example). Crie um `.env` na raiz só para mudar portas, credenciais locais ou configurar o webhook de alertas; os comandos `pnpm infra:*` o leem pelo `infra/docker/compose.sh`.

## Endereços

| Serviço                        | Endereço                                                     | Credenciais (só locais)          |
| ------------------------------ | ------------------------------------------------------------ | -------------------------------- |
| PostgreSQL 16                  | `127.0.0.1:5432`, banco `prejuzero`                          | `pz_dev` / `pz_dev_local`        |
| Redis                          | `127.0.0.1:6379`                                             | sem senha                        |
| S3 (RustFS)                    | API `http://127.0.0.1:9000`, console `http://127.0.0.1:9001` | `pz_dev` / `pz_dev_local_secret` |
| Mailpit                        | SMTP `127.0.0.1:1025`, interface `http://127.0.0.1:8025`     | sem senha                        |
| Grafana (perfil observability) | `http://127.0.0.1:3001`                                      | `admin` / `admin`                |
| OTLP (perfil observability)    | gRPC `127.0.0.1:4317`, HTTP `127.0.0.1:4318`                 | —                                |

Buckets criados automaticamente: `pz-arquivos`, `pz-relatorios` e `pz-auditoria-worm` (com object lock).

Extensões criadas no Postgres: `pg_trgm`, `unaccent` e `pg_partman` (schema `partman`). O `pgvector` está instalado, mas só é habilitado pela migração que o usar.

## Problemas comuns

- **Porta ocupada:** defina outra porta no `.env` (ex.: `POSTGRES_PORT=5433`) e ajuste a URL correspondente.
- **Dados corrompidos ou migração quebrada em desenvolvimento:** `pnpm infra:reset`.
- **Bucket não criado:** rode de novo `docker compose -f infra/docker/compose.yml run --rm armazenamento-init` (é idempotente).
