# @pz/adapter-anthropic

Adaptador `ProvedorIA` da Anthropic (Claude), HU21, ADR-005/016. Só `packages/ia` usa a porta.

- `gerarEstruturado`: saída estruturada por `output_config.format` (JSON Schema gerado do schema Zod de quem chama) e validada de novo aqui; recusa, saída truncada, texto que não é JSON ou fora do schema viram `ErroSaidaInvalida` (a plataforma de IA manda para revisão manual).
- Prompt caching do bloco de sistema (instruções e taxonomia) com `cachePrompt`.
- Uso por chamada: tokens de entrada (com a escrita no cache), de saída e lidos do cache. Custo, latência e versão do prompt são registrados pela plataforma (`packages/ia`).
- Erros classificados pelas classes tipadas do SDK; retentativa, timeout, cota e circuit breaker ficam com o registro (SDK com `maxRetries: 0`).
- Modelo padrão: `claude-haiku-4-5` (`MODELO_PADRAO`), trocável pela configuração das tarefas em `packages/ia`.

## Configuração

| Variável            | Uso                                                                     |
| ------------------- | ----------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Chave da API (só ambiente ou cofre). Sem ela o adaptador fica desligado |

## Testes

Sem rede: `src/servidor-de-fixtures.ts` responde como a API a partir de `fixtures/`, montadas no formato documentado da API com conteúdo fictício. Ainda **não** são gravações de chamadas reais (exigem conta paga); quando houver chave, regravar e conferir (pendência no quadro).
