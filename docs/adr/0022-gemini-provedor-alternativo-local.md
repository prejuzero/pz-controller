# ADR-022 · Gemini como provedor alternativo de IA, só na validação local com dados fictícios

- **Status:** Aceito (aprovado pelo usuário em 06/11/2026)
- **Data:** 2026-11-06

## Contexto

A IA do produto usa modelos Claude por padrão (CLAUDE.md, seção 7) atrás da porta `ProvedorIA` (ADR-008, ADR-016). Até a validação do produto não há custo: tudo roda localmente com uma advogada (a curadora) e o QA. Sem chave paga, a classificação por IA fica desligada e só as regras rápidas classificam. O usuário gerou uma chave gratuita e limitada do Google Gemini para exercitar a IA nesse período.

No plano gratuito, o Google pode usar o conteúdo enviado para melhorar os produtos dele. Dados de clientes nunca podem treinar modelos (CLAUDE.md, seção 11), então essa chave não pode receber publicações reais.

## Decisão

- Adaptador `@pz/adapter-gemini` (`ProvedorIaGemini`) atrás da porta `ProvedorIA`, pela API REST `generateContent`, sem SDK (sem dependência nova). Saída estruturada por `responseJsonSchema` gerado do schema Zod e validada de novo no adaptador. Raciocínio do modelo (partes `thought`) não entra na saída. Ferramentas não são suportadas e são recusadas explicitamente.
- O Claude continua o padrão. O worker escolhe o provedor pela configuração: com `ANTHROPIC_API_KEY`, Anthropic; sem ela, Gemini **só** com `GEMINI_API_KEY` **e** `IA_DADOS_FICTICIOS=sim`, a declaração de quem liga de que o banco local só tem dados fictícios. Sem a declaração, o Gemini não liga e um aviso vai para o log.
- Com o Gemini, todas as tarefas de `packages/ia` usam o modelo de `GEMINI_MODELO` (padrão `gemini-3.5-flash`) por `comProvedorAlternativo`, sem mudar o arquivo versionado de tarefas. Preço zero (chave gratuita); o orçamento mensal de tokens por tarefa continua valendo.
- O 503 "alta demanda" e o 404 sem corpo, que o serviço devolve de forma intermitente, são erros passageiros: o registro de adaptadores tenta de novo (ADR-005).

## Alternativas

- **Só regras rápidas até haver provedor contratado:** sem risco, mas sem exercitar o fluxo de IA na validação.
- **Gemini com dados reais:** proibido pelo CLAUDE.md (seção 11) no plano gratuito.
- **Trocar o padrão para o Gemini:** mudaria a stack (seção 7) e a avaliação de 98% foi feita para o Claude.

## Consequências

- A avaliação (`pnpm eval`) continua contra as respostas gravadas do Claude; a acurácia do Gemini não é medida por ela. Resultados da IA com o Gemini servem para validar o fluxo, não a qualidade da classificação.
- A chave fica só no `.env` local (ignorado pelo git), nunca no repositório, em fixture ou em log.
- Para validar com a OAB real da curadora, a IA tem de ficar desligada (sem `IA_DADOS_FICTICIOS=sim`) ou usar um provedor contratado sem retenção para treino.
