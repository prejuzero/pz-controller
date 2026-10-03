# ADR-008 · IA atrás de porta, com saída estruturada e validada

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

Seção 7 da especificação; trocar modelo ou provedor sem mudar o domínio; controlar custo.

## Decisão

A IA só interpreta texto. Recebe a taxonomia de atos e responde por saída estruturada validada com Zod; modelo e prompt são versionados e configuráveis; regras rápidas rodam antes; cada chamada registra modelo, versão do prompt, tokens, custo e latência. A IA nunca devolve data nem escolhe o fundamento legal.

## Consequências

Toda mudança de prompt, modelo ou taxonomia passa pelo gate de avaliação (≥ 98%).
