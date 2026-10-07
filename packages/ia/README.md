# packages/ia

Plataforma de IA (ADR-016): roteamento de modelos por tarefa com fallback, registro de prompts versionados, saída estruturada validada por Zod, guardrails (injeção de prompt, minimização de dados, limites de custo), catálogo único de ferramentas e observabilidade de LLM. Não chama SDK de IA diretamente: usa a porta ProvedorIA de packages/integracoes.

Implementado em: HU58 (plataforma) e HU59 (catálogo de ferramentas). Siga o [CLAUDE.md](/CLAUDE.md) e os ADRs citados.

## Roteamento por tarefa (HU58)

- `configuracao/tarefas.json` (versionado): por tarefa, modelos em ordem de preferência (`provedor` + `modelo`), temperatura, `maxTokensSaida`, `cachePrompt` e `lote`. Validado por `lerConfiguracaoDasTarefas` no boot.
- `PlataformaIa.executarTarefa(tarefa, prompt, schema)`: chama o primário; em erro transitório, cota ou circuito aberto passa ao próximo modelo ou provedor. Saída inválida, credencial e erro inesperado sobem na hora. O resultado traz modelo, provedor, versão do prompt e da configuração, uso de tokens e as falhas anteriores.
- `PlataformaIa.enviarLote(tarefa, itens)`: primeiro provedor da tarefa que aceita lote; sem lote habilitado, erro explícito.
- Os provedores entram como `ProvedorIA` (registro de adaptadores, com resiliência); nenhum SDK de IA aqui.
