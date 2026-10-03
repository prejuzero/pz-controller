# ADR-011 · Observabilidade com OpenTelemetry

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

RNF01: nenhuma falha silenciosa.

## Decisão

Logs JSON (pino) com correlação; traces e métricas OpenTelemetry de ponta a ponta (HTTP, fila, banco, integrações); erros no Sentry; exportação OTLP para backend trocável.

## Consequências

Todo ponto novo de código relevante emite log, métrica e trace; alertas apontam para runbooks.
