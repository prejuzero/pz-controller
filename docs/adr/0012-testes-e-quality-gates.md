# ADR-012 · Estratégia de testes e quality gates

- **Status:** Aceito
- **Data:** 2026-10-03

## Contexto

Código escrito por IA precisa de barreiras automáticas fortes para manter a qualidade.

## Decisão

Pirâmide de testes com gates obrigatórios no CI, detalhada em `docs/padroes-engenharia.md` e no CLAUDE.md, seção 13.

## Consequências

Nenhum merge sem CI verde; cobertura mínima por pacote; mutação no motor de prazos; avaliação de IA quando prompts mudam.
