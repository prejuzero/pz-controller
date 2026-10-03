# ADR-004 · Eventos de domínio com outbox transacional

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

Módulos precisam reagir uns aos outros sem acoplamento e sem perder eventos.

## Decisão

Módulos gravam eventos na tabela `evento_dominio` na mesma transação da mudança; um relay publica no BullMQ; consumidores são idempotentes (tabela `evento_processado`).

## Consequências

Eventos versionados (tipo + versão + schema Zod). O mesmo fluxo alimentará webhooks públicos (F2) e poderá migrar para um broker externo trocando só o relay.
