# ADR-002 · Monorepo TypeScript com pnpm e Turborepo

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

Portal, API e workers compartilham tipos e contratos; builds precisam ser incrementais.

## Decisão

Um repositório, TypeScript strict em tudo, pnpm workspaces e Turborepo com cache.

## Consequências

Pacotes publicáveis (`motor-prazos`, `contracts`) seguem SemVer. Versões de dependências fixadas (sem `^`).
