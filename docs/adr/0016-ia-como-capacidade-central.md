# ADR-016 · IA como capacidade central da plataforma

- **Status:** Aceito
- **Data:** 2026-10-03
- **Complementa:** ADR-008 (as regras do ADR-008 continuam válidas)

## Contexto

A IA é o diferencial do PrejuZero: interpretar intimações, explicar prazos, responder perguntas sobre a carteira e agir por canais conversacionais. O mercado converge para agentes com ferramentas (tool use), protocolos abertos para que assistentes de IA acessem sistemas (MCP), saídas estruturadas, roteamento entre modelos, avaliação contínua e observabilidade de LLM. Ao mesmo tempo, no domínio jurídico, um erro de data causa dano real: a IA precisa ser poderosa sem nunca decidir o que é competência do motor determinístico e do advogado.

## Decisão

1. **Limites inegociáveis (mantidos do ADR-008 e do CLAUDE.md, seção 4).** A IA nunca calcula datas, nunca escolhe o fundamento legal e nunca confirma ciência ou prazo em nome do advogado. Ela interpreta, resume, sugere e consulta; o motor calcula; o advogado decide.
2. **Plataforma de IA em `packages/ia`.** Camada técnica única para toda funcionalidade de IA:
   - **Roteamento de modelos por tarefa** (configuração, não código): modelos rápidos e baratos para classificação, modelos mais capazes para agentes e raciocínio, com fallback entre modelos e provedores via a porta `ProvedorIA`.
   - **Registro de prompts versionados** com changelog; toda resposta guarda modelo e versão do prompt.
   - **Saída estruturada** validada por Zod em toda chamada que alimenta o sistema.
   - **Guardrails:** isolamento do conteúdo externo (publicações, mensagens) contra injeção de prompt, minimização e redação de dados pessoais antes do envio quando o caso de uso permitir, validação da saída, limites de custo por tenant e por funcionalidade.
   - **Otimização de custo:** cache de prompt, processamento em lote para trabalhos assíncronos e deduplicação (ADR-014).
   - **Observabilidade de LLM:** cada chamada vira span OpenTelemetry com modelo, tokens, custo, latência, versão do prompt e resultado da validação; painéis de custo e qualidade.
3. **Catálogo único de ferramentas (tools).** As capacidades que a IA pode usar (buscar prazos, buscar publicações, consultar processo, simular cálculo pelo motor, explicar memória de cálculo, consultar base jurídica) são definidas uma vez, com schema Zod, permissão exigida e auditoria. Cada ferramenta chama casos de uso da aplicação com o tenant e as permissões do usuário aplicados no código; o modelo nunca escolhe de qual cliente lê. O mesmo catálogo é exposto:
   - ao assistente interno (portal, app e, no futuro, WhatsApp);
   - a assistentes de IA externos por um **servidor MCP** (`apps/mcp`) autenticado por OAuth 2.1 (ADR-015);
   - como base para a API pública, quando fizer sentido.
     Ferramentas que alteram estado exigem confirmação humana explícita no cliente.
4. **Avaliação contínua para toda funcionalidade de IA.** Cada funcionalidade tem conjunto de avaliação próprio em `eval/` (anonimizado), meta de qualidade e gate no CI quando prompt, modelo, ferramenta ou taxonomia mudam. Correções feitas pelos advogados alimentam a curadoria.
5. **Transparência e controle humano.** Toda sugestão gerada por IA é identificada como tal na interface, mostra a evidência (trecho e fundamento) e pode ser corrigida; correções ficam na auditoria.
6. **Dados.** Sem treino de modelos com dados de clientes; provedores contratados sem retenção para treino; RAG com `pgvector` no próprio PostgreSQL, com RLS, quando a base jurídica e a busca semântica forem implementadas.

## Consequências

- Nova história de plataforma de IA (roteamento, prompts, guardrails, observabilidade) antes do classificador (HU21).
- Novas histórias: catálogo de ferramentas, servidor MCP, assistente conversacional e resumo/explicação de publicações.
- Toda funcionalidade de IA nova segue o mesmo caminho: `packages/ia` + catálogo de ferramentas + avaliação + observabilidade. Não há chamada direta a SDK de IA fora do adaptador.
- `pgvector` e o protocolo MCP passam a fazer parte da stack.
