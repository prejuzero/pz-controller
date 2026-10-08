# QA da HU18 · Ingestão e deduplicação de publicações (PZ-150)

Testes em `modules/publicacoes/infra/qa-ingestao.int.test.ts` (Testcontainers, PostgreSQL 16 real, RLS ativa). Dados fictícios.

## Casos

| Caso do card                                        | Resultado                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Mesma publicação para 10 advogados em 3 escritórios | 1 conteúdo global, 1 `PublicacaoNova`, 3 destinatários (1 por escritório) e 3 `PublicacaoRecebida` |
| Captura repetida da mesma janela                    | Nenhuma linha nem evento a mais (conteúdo, destinatário, processo, outbox)                         |
| Escritório A não vê conteúdo que só C recebeu       | Fora da lista e 404 pelo id, em A e em B                                                           |
| Carga de 100 mil publicações                        | Ver abaixo                                                                                         |

**Divergência com o card:** o card fala em "10 destinatários". Pelo ADR-014 (que prevalece sobre o card), o destinatário é **por escritório** (chave tenant + conteúdo), então são 3. A OAB registrada no destinatário é a da primeira captura que o trouxe. Se o produto precisar saber quais advogados do escritório foram intimados, isso é requisito novo (pendência aberta).

## Carga

SLO de referência (docs/padroes-engenharia.md): publicação visível no portal em até 30 min após a captura.

| Execução                                       | Volume  | Tempo   | Vazão       | 100 mil em |
| ---------------------------------------------- | ------- | ------- | ----------- | ---------- |
| Local, 08/10/2026 (`CARGA_PUBLICACOES=100000`) | 100.000 | 179,3 s | 33.466/min  | ~3,0 min   |
| CI (padrão)                                    | 3.000   | ~6 s    | ~32.000/min | ~3,1 min   |

Cenário: lotes de 500 publicações por evento de captura (como a captura entrega), 50 publicações por processo (2.000 processos criados no caminho, com auditoria), 3 escritórios, uma conexão por vez (um job por vez no worker).

Máquina: Apple M2, 16 GB de RAM, Docker local. Não mede a fila (BullMQ) nem o relay do outbox; mede a transação de ingestão, que é o gargalo do banco.

Como repetir:

```
CARGA_PUBLICACOES=100000 pnpm --filter @pz/publicacoes exec vitest run --config vitest.int.config.ts infra/qa-ingestao
```
