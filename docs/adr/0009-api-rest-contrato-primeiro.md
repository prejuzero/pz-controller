# ADR-009 · API REST versionada, contrato primeiro

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

O mesmo contrato servirá ao portal, à API pública e a integradores (F2).

## Decisão

REST JSON em `/v1`; schemas Zod em `packages/contracts` como fonte única para validação no NestJS, OpenAPI 3.1 gerado e cliente TypeScript gerado para o portal; erros RFC 9457 (problem+json); paginação por cursor; `Idempotency-Key` em operações sensíveis.

## Consequências

Quebra de contrato só em nova versão (`/v2`); verificação de quebra no CI.
