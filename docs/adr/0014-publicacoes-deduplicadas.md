# ADR-014 · Publicações deduplicadas globalmente

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

Seções 6.3 e 6.4 da especificação e regra 7 da IA: uma captura e uma classificação para N advogados e N escritórios.

## Decisão

`publicacao_conteudo` é global e imutável (chave: fonte + hash do conteúdo normalizado); `publicacao_destinatario` é por tenant, com RLS. A classificação acontece uma vez por conteúdo e a captura opera por alvo global (OAB ou processo) compartilhado entre tenants.

## Consequências

O conteúdo só é acessível via destinatário do próprio tenant.
