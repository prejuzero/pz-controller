# packages/motor-prazos

Motor puro de cálculo de prazos (ADR-007): sem IO, sem relógio e sem IA. Só importa `packages/kernel`. Toda regra segue a seção 4 do CLAUDE.md (base legal exclusiva) e exige 100% de cobertura, mutação ≥ 90% e casos assinados pela curadoria.

**Área de alto risco** (CLAUDE.md, seção 15): 2 revisores humanos e a curadora.

## Peças

| Arquivo         | O que faz                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelo.ts`     | Entrada (ramo, meio, data de referência, prazo da tabela, condições, fuso do juízo, calendário) e saída (`calculado` com memória de cálculo ou `a-confirmar` com o motivo)                   |
| `calendario.ts` | Interface `CalendarioForense`: o módulo calendario entrega as ocorrências da jurisdição; o motor decide o efeito (`sem-expediente`, `suspensao-de-prazos`, `indisponibilidade`)              |
| `dias.ts`       | Aritmética: critérios de contagem (dias úteis com sábado e domingo fora, CPC, art. 216; dias corridos) e contagem com registro de cada dia desconsiderado                                    |
| `memoria.ts`    | `serializarResultado` (JSON canônico: mesma entrada, mesmos bytes; para gravar no prazo e comparar em recálculos) e `formatarMemoria` (memória em português para portal, e-mail e relatório) |
| `regras.ts`     | `calcularPrazo`: RN01 a RN08 aprovadas pela curadoria (V1 e V2), com fundamento de cada passo e alternativas quando a regra deixa uma decisão em aberto                                      |

## Estado (HU14)

- PZ-132 (este pacote): modelo e aritmética. Testes sobre calendários fictícios e propriedades (fast-check).
- PZ-133: regras aprovadas nas revisões V1 e V2 da curadoria (`docs/curadoria`).

## Ordem das regras (`calcularPrazo`)

1. Sem prazo na tabela, unidade fora de dias (V2, Q14 e Q15) ou contagem da tabela diferente da do ramo: "a confirmar".
2. Marco inicial: DJEN (RN03, Lei 11.419/2006, art. 4º), portal (RN04, art. 5º, §§1º a 3º, e CPC, art. 231, V) ou ciência informada.
3. Vigência da regra do ramo na data de início (CPC, art. 14): antes dela, "a confirmar".
4. Prazo em dobro (RN06) pela política da linha da tabela (`dobro`, aba 9 da V2).
5. Contagem (RN01, RN07): úteis no cível, juizado cível e trabalhista; corridos no penal e no juizado criminal. Calendário (RN05) e suspensão de 20/12 a 20/01 por ramo (RN02).
6. Prorrogação do vencimento (RN08; penal: CPP, art. 798, §3º).

Na dúvida, a data sugerida é a mais cedo e as demais vão em `alternativas` (CLAUDE.md, seção 4.4): penal sem a informação das exceções do CPP, art. 798-A (C03), penal com vencimento no sábado (C01) e dobro "verificar caso a caso".

Ficam "a confirmar" até nova resposta da curadoria: 10º dia do portal em dia não útil (C04), ciência pelo portal no penal e prazos iniciados antes da vigência da regra cadastrada.

A suspensão de 20/12 a 20/01 é regra do motor (RN02): o módulo calendario não deve entregar esses dias como `suspensao-de-prazos` nacional, só os atos próprios de cada tribunal.

- PZ-134: memória de cálculo completa e versionamento. O resultado traz `fimDoPrazo` (24h do vencimento no fuso do juízo, CPC, art. 213, parágrafo único; ADR-013), `avisos` (feriados locais não verificados, fuso diferente de Brasília, alternativas e alerta da linha da tabela) e `versaoDoMotor`, que muda a cada alteração de regra ou de saída.
- PZ-135: suíte do motor.
  - `fixtures/casos-curadoria-v2.json`: os 27 casos da aba 6 da V2 (assinados pela curadora em 29/10/2026), com entrada, dias listados por ela e resultado esperado; rodados em `src/casos-curadoria.test.ts`. CT18 e CT26 ficam em `divergencias` (regra pendente com a curadoria) e o teste fixa a resposta atual do motor. Mudar um caso exige nova assinatura.
  - `src/propriedades.test.ts`: propriedades com calendários aleatórios (vencimento não antes do início, vencimento em dia útil, determinismo, dobro nunca encurta).
  - Mutação: `pnpm --filter @pz/motor-prazos mutacao` (Stryker; quebra abaixo de 90%, também no CI). Relatório em `reports/mutacao/`.
