# packages/ia

Plataforma de IA (ADR-016): roteamento de modelos por tarefa com fallback, registro de prompts versionados, saída estruturada validada por Zod, guardrails (injeção de prompt, minimização de dados, limites de custo), catálogo único de ferramentas e observabilidade de LLM. Não chama SDK de IA diretamente: usa a porta ProvedorIA de packages/integracoes.

Implementado em: HU58 (plataforma) e HU59 (catálogo de ferramentas). Siga o [CLAUDE.md](/CLAUDE.md) e os ADRs citados.

## Roteamento por tarefa (HU58)

- `configuracao/tarefas.json` (versionado): por tarefa, modelos em ordem de preferência (`provedor` + `modelo`), temperatura, `maxTokensSaida`, `cachePrompt` e `lote`. Validado por `lerConfiguracaoDasTarefas` no boot.
- `PlataformaIa.executarTarefa(tarefa, prompt, schema)`: chama o primário; em erro transitório, cota ou circuito aberto passa ao próximo modelo ou provedor. Saída inválida, credencial e erro inesperado sobem na hora. O resultado traz modelo, provedor, versão do prompt e da configuração, uso de tokens e as falhas anteriores.
- `PlataformaIa.enviarLote(tarefa, itens)`: primeiro provedor da tarefa que aceita lote; sem lote habilitado, erro explícito.
- Os provedores entram como `ProvedorIA` (registro de adaptadores, com resiliência); nenhum SDK de IA aqui.

## Prompts versionados e origem das sugestões (HU58)

- `prompts/<tarefa>.json`: `versao` (semver), `sistema`, `usuario` (com `{{variaveis}}`) e `changelog`, cuja entrada da versão atual guarda o SHA-256 do conteúdo. Mudar o texto sem subir a versão e registrar a mudança falha nos testes; o gate de avaliação (`pnpm eval`) entra com a HU22.
- `RegistroDePrompts.doDiretorio(...)` valida tudo no boot; `montar(tarefa, variaveis)` recusa variável faltando ou sobrando e devolve o `PromptIA` com a versão `tarefa@x.y.z`.
- `origemIa(resultado, agora, confianca?)`: modelo, provedor, versão do prompt e da configuração, confiança e instante. Toda sugestão persistida leva esse objeto (`OrigemIa` em `@pz/contracts`) para a interface marcar "sugerido por IA".
- Correção do advogado: evento `SugestaoIaCorrigida` (só códigos e valores curtos), registrado na trilha como `ia.sugestao-corrigida`.

## Guardrails (HU58)

- **Conteúdo externo**: variáveis marcadas em `externas` no arquivo do prompt são escapadas (`<`/`>`) dentro do bloco delimitado e inspecionadas por `detectarInstrucaoEmbutida`; `montar` devolve os alertas para registro (o texto segue como dado).
- **Dados pessoais**: com `minimizarDadosPessoais` (padrão), CPF, CNPJ, e-mail, CEP e telefone com DDD viram marcadores. Número CNJ e OAB ficam. Nome e endereço por extenso não são detectados.
- **Saída sem datas** (`saidaSemDatas` na tarefa): qualquer data nos textos da saída, exceto nos campos de trecho literal, vira erro (revisão manual), ADR-008.
- **Orçamento** (`orcamentoMensalTokens`): por tenant, tarefa e mês de Brasília; a partir de 80% chama `aoAlertar`; esgotado, `OrcamentoDeIaEsgotado` antes de chamar o provedor (a funcionalidade cai no fluxo manual).
- **Uso e custo** (HU21): `precos` em `tarefas.json` (US$ por milhão de tokens, com `fonteDosPrecos`); todo modelo de tarefa precisa de preço, senão a configuração é recusada no boot. Cada chamada bem-sucedida vai para a porta `RegistroDeUsoDeIa` com o custo estimado (`custoEstimadoUsd`). `RegistroComOrcamentoDiario` alerta uma vez por dia quando o custo do dia passa do orçamento em US$ (sem bloquear).
