# ADR-003 · Multi-tenancy com row-level security

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

Isolamento total entre clientes é requisito (RNF07) e não pode depender apenas de código correto.

## Decisão

`tenant_id` em toda tabela de negócio; RLS ENABLE + FORCE; a aplicação conecta com papel sem BYPASSRLS e define `app.tenant_id` com `SET LOCAL` dentro de cada transação.

## Consequências

Compatível com PgBouncer em modo transaction. Jobs globais usam um cliente "sistema" explícito e auditado. Dados globais (calendário nacional, tabela de prazos, conteúdo deduplicado de publicações, alvos de monitoramento) ficam em tabelas sem tenant com acesso controlado.
