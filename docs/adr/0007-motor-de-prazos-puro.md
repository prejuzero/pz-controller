# ADR-007 · Motor de prazos puro e regras versionadas como dado

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

Princípio 2 (a data nunca é calculada pela IA), testabilidade total e revisão pelo curador jurídico.

## Decisão

`packages/motor-prazos` é uma biblioteca pura (sem IO, sem relógio, sem IA) que recebe o calendário por interface e devolve memória de cálculo. Regras parametrizáveis (tabela de prazos, calendário) ficam em dados versionados. Toda regra tem fundamento em norma oficial vigente (CLAUDE.md, seção 4).

## Consequências

Versão do motor e da tabela gravadas em cada prazo; mudança de regra gera nova versão e recálculo controlado.
