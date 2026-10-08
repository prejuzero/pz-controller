# QA da HU19 · Indisponibilidade simulada da fonte (PZ-153)

Teste de caos em `modules/captura/infra/qa-indisponibilidade.int.test.ts` (Testcontainers, PostgreSQL 16 real, outbox e recuo reais; relógio controlado). Dados fictícios.

## Cenário

2 escritórios, 2 OABs (uma assinada pelos dois). Captura normal às 09:00; DJEN fora do ar das 10:00 às 13:00 (um ciclo de agendamento por hora); volta às 13:00.

| Caso do card                 | Resultado                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Alerta à equipe              | `fonte-degradada` **uma vez**, na 3ª falha seguida                                                           |
| Faixa no portal              | `GET /v1/captura/status` devolve `degradada` para os dois escritórios; `FonteDegradada` gravado para cada um |
| Recaptura completa ao voltar | Janela de cada OAB de 06/10 (último sucesso − 1 dia) até 07/10; nenhum dia perdido                           |
| Sem duplicatas               | Repetir os jobs dá `ja-entregue`; 3 entregas antes + 3 na recaptura, nenhuma a mais                          |
| Falha só de uma OAB          | `alvo-falhando` uma vez na 5ª falha; fonte continua `operacional`                                            |

## Bug encontrado e corrigido

Durante a queda, todos os alvos entram em recuo (30 min dobrando até 6 h). Quando a fonte voltava, **nenhum alvo estava devido**: a fonte só seria dada como restabelecida (e a faixa só sumiria) quando o recuo vencesse, até 6 h depois. Os dados não se perdiam (a janela cobre o período), mas a captura atrasava.

Correção: com a fonte degradada, cada rodada do agendamento inclui uma **sonda** (o alvo em recuo mais antigo). O primeiro sucesso restabelece a fonte e antecipa os demais, capturados na rodada seguinte.

## Como repetir

```
pnpm --filter @pz/captura test:int
```
