# ADR-020 · Módulo busca como orquestrador, sem modelo de leitura próprio no MVP

- **Status:** Proposto (aguarda aprovação humana)
- **Data:** 2026-10-31

## Contexto

A busca avançada (HU28) combina com E campos de três módulos: processo (número, cliente, tribunal, órgão, comarca: `cadastro`), prazo (ato, status, ciência, responsável, ramo, origem, datas: `prazos`) e teor e OAB (`publicacoes`). As regras de fronteira proíbem ler a tabela de outro módulo (CLAUDE.md, seção 3), e a mesma busca vai servir à busca em linguagem natural (HU47) e à API pública.

## Decisão

- Módulo `busca` sem tabelas. Ele valida o schema único `FiltrosBusca` (`packages/contracts`), resolve os atalhos de período no fuso de São Paulo e repassa a cada módulo só o que é dele. Os filtros de processo, de teor e de OAB viram listas de ids (processos, conteúdos, usuários) que o outro módulo recebe como filtro.
- Cada módulo busca nos próprios dados: `prazos` pelo query builder do Prisma e `publicacoes` pela view `publicacao_do_tenant`, com busca textual em `teor_tsv`. As consultas usam só parâmetros ligados, sem SQL montado com texto.
- Tetos explícitos: até 10.000 processos ou conteúdos por filtro (acima disso, 400 pedindo para refinar) e contagem até 1.000 ("mais de 1.000").
- A busca de publicações recusa filtros que só existem no prazo (400). Ignorá-los em silêncio daria um resultado errado.

## Alternativas

- **Modelo de leitura próprio (projeção por eventos):** junta tudo numa tabela, mas exige consumidores de todos os eventos, reprocessamento e consistência eventual. Fica para quando os tetos acima incomodarem (escritórios com mais de 10 mil processos num tribunal).
- **View que junta tabelas de vários módulos:** quebra a fronteira entre módulos.

## Consequências

- Uma busca faz até três consultas, uma por módulo envolvido.
- O desempenho depende dos índices de cada módulo (migração `20261106000000_indices_busca`) e é medido no teste de 1 milhão de publicações (`pnpm --filter @pz/publicacoes test:int:desempenho`).
