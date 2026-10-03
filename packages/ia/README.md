# packages/ia

Plataforma de IA (ADR-016): roteamento de modelos por tarefa com fallback, registro de prompts versionados, saída estruturada validada por Zod, guardrails (injeção de prompt, minimização de dados, limites de custo), catálogo único de ferramentas e observabilidade de LLM. Não chama SDK de IA diretamente: usa a porta ProvedorIA de packages/integracoes.

Implementado em: HU58 (plataforma) e HU59 (catálogo de ferramentas). Siga o [CLAUDE.md](/CLAUDE.md) e os ADRs citados.
