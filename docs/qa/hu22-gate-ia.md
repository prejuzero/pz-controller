# QA da HU22 · Gate de qualidade da IA (PZ-163)

Teste em `eval/src/qa.test.ts` (Vitest, sem rede). Conjunto de 50 casos fictícios, marcados como reais e revisados **só em memória** para exercitar a meta; provedor de IA simulado, gravado e reproduzido pelo mesmo caminho do CI (`GravadorDeProvedor` → `ProvedorGravado`), passando pelo caso de uso real (`ClassificarPublicacao` + `PlataformaIa`).

| Caso do card                        | Resultado                                                                                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linha de base                       | Prompt 1.0.0 gravado e reproduzido: 100%, **aprovado**                                                                                                                                             |
| Prompt alterado sem regravar        | Prompt 1.1.0 com as gravações da 1.0.0: 50 casos sem gravação, **reprovado** ("sem resposta gravada… rode pnpm eval --gravar")                                                                     |
| Regressão proposital no prompt      | Prompt 1.1.0 regravado com um modelo que piorou: 50% de acerto, **reprovado** ("50,0% abaixo da meta de 98,0%"), 25 erros listados no relatório                                                    |
| Limite da meta                      | 49/50 (98%) aprovado; 48/50 (96%) reprovado                                                                                                                                                        |
| Mudança que não toca IA não dispara | Workflow próprio, `.github/workflows/avaliacao-ia.yml`, com filtro `paths` (eval, packages/ia, modules/classificacao, adaptador Anthropic, porta ProvedorIA); PR só de outro módulo não roda o job |

No CI, `pnpm eval` sai com código 1 e anota `::error::` no PR quando reprova; o relatório fica no resumo do job e no artefato `avaliacao-ia`.

## Limites

- Ainda não há casos reais revisados nem gravações reais (exigem a chave da Anthropic): hoje o gate do repositório passa com aviso "meta não medida". Pendência: "Taxonomia e regras aprovadas na referência do eval".
- Por usar filtro de caminhos, o job não pode ser marcado como verificação obrigatória na proteção da `main` (fica pendente nos PRs que não tocam IA). O bloqueio vale porque ele falha quando roda.

## Como repetir

```
pnpm --filter @pz/eval test
pnpm eval
```
