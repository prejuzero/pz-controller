# ADR-010 · Portabilidade de infraestrutura

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

LGPD e latência hoje; liberdade de trocar de nuvem amanhã.

## Decisão

Containers OCI, configuração 12-factor validada no boot, PostgreSQL padrão (extensões apenas pg_trgm, unaccent, pg_partman), Redis, armazenamento S3-compatível, e-mail por adaptador; IaC em Terraform com AWS sa-east-1 como alvo inicial.

## Consequências

Ambiente local equivalente em Docker Compose (MinIO, Mailpit). Serviços gerenciados aparecem só na configuração, nunca no código.
