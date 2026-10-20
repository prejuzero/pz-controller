# packages/motor-prazos

Motor puro de cálculo de prazos (ADR-007): sem IO, sem relógio e sem IA. Só importa `packages/kernel`. Toda regra segue a seção 4 do CLAUDE.md (base legal exclusiva) e exige 100% de cobertura, mutação ≥ 90% e casos assinados pela curadoria.

**Área de alto risco** (CLAUDE.md, seção 15): 2 revisores humanos e a curadora.

## Peças

| Arquivo         | O que faz                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelo.ts`     | Entrada (ramo, meio, data de referência, prazo da tabela, condições, fuso do juízo, calendário) e saída (`calculado` com memória de cálculo ou `a-confirmar` com o motivo)      |
| `calendario.ts` | Interface `CalendarioForense`: o módulo calendario entrega as ocorrências da jurisdição; o motor decide o efeito (`sem-expediente`, `suspensao-de-prazos`, `indisponibilidade`) |
| `dias.ts`       | Aritmética: critérios de contagem (dias úteis com sábado e domingo fora, CPC, art. 216; dias corridos) e contagem com registro de cada dia desconsiderado                       |

## Estado (HU14)

- PZ-132 (este pacote): modelo e aritmética. Testes sobre calendários fictícios e propriedades (fast-check).
- PZ-133: regras aprovadas na revisão V1 da curadoria (`docs/curadoria`). Penal, prazo do texto x tabela e unidades fora de dias ficam "a confirmar" até a V2.
- PZ-134: memória de cálculo completa e versionamento.
- PZ-135: casos com datas reais assinados pela curadoria e teste de mutação (Stryker).
