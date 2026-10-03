# ADR-001 · Monolito modular hexagonal

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

Equipe pequena, deploy simples e necessidade de fronteiras claras que permitam extrair um módulo para serviço próprio se um dia for preciso.

## Decisão

Uma aplicação (API + workers) dividida em módulos com camadas `domain`, `application` e `infra` (portas e adaptadores).

## Consequências

Fronteiras vigiadas por ferramenta (dependency-cruiser no CI). Nenhum acesso direto a tabelas de outro módulo; comunicação apenas pelo `index.ts` do módulo ou por eventos.
