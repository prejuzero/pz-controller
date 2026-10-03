# ADR-006 · Auditoria append-only com hash encadeado

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

RF84–RF87 e RNF14–RNF17: a trilha precisa servir de prova e não pode ser alterada por ninguém.

## Decisão

`evento_auditoria` particionada por mês, sem UPDATE/DELETE (privilégios + trigger), cadeia por tenant com SHA-256 sobre JSON canônico (RFC 8785), sequência serializada por advisory lock, horário do banco; cópia diária em armazenamento WORM.

## Consequências

O registro acontece na mesma transação da mudança. O carimbo do tempo ICP-Brasil (F2) entra sobre o hash dos lotes.
