# ADR-024 · Vários provedores de IA em ordem de preferência e Gemini no plano pago

- **Status:** Aceito (aprovado pelo usuário em 13/11/2026)
- **Data:** 2026-11-13
- **Complementa:** ADR-016 (plataforma de IA) e ADR-022 (Gemini só com dados fictícios)

## Contexto

O piloto roda localmente com dados reais de clientes. Sem IA, o sistema não reconhece o tipo de ato das intimações: o prazo nasce "a confirmar" sem data e o advogado escolhe o ato para o motor calcular pela tabela da curadoria. O usuário pediu vários conectores (Gemini, OpenAI, Anthropic) e tem uma chave do Google Gemini.

No plano gratuito, o Google pode usar o conteúdo para melhorar os produtos, o que é proibido para dados de clientes (CLAUDE.md, seção 11; LGPD; sigilo profissional). No plano pago (faturamento ativo no projeto da chave), o Google não usa os dados para treino. As APIs da Anthropic e da OpenAI também não usam os dados enviados para treino por padrão.

## Decisão

- **Ordem de preferência:** `IA_PROVEDORES` (padrão `anthropic,openai,gemini`). Entra só o provedor com chave e que pode receber o conteúdo. Cada tarefa de `packages/ia` tenta os provedores nessa ordem e cai para o seguinte quando um falha. Anthropic usa os modelos da configuração de cada tarefa; OpenAI e Gemini usam o modelo de `OPENAI_MODELO` e `GEMINI_MODELO`.
- **Conector da OpenAI:** `@pz/adapter-openai`, atrás da porta `ProvedorIA`, pela API REST `/chat/completions`, sem SDK e sem dependência nova. Saída estruturada por `response_format` (JSON Schema do Zod), validada de novo no adaptador. Não envia temperatura, porque os modelos de raciocínio só aceitam a padrão.
- **Gemini no plano pago:** com `GEMINI_PLANO=pago`, declaração de quem configura de que o faturamento está ativo, o Gemini recebe dados reais, com limites maiores no registro. Com `GEMINI_PLANO=gratuito` (o padrão), continua valendo o ADR-022: só com `IA_DADOS_FICTICIOS=sim`.
- **Preço:** os modelos da OpenAI e do Gemini entram sem preço de tabela cadastrado, porque não há fonte oficial no repositório. O orçamento mensal em tokens por tarefa continua limitando o uso, e o custo exato fica com o painel do provedor (PZ-302).
- **Nada muda nos limites da IA:** ela não devolve data (ADR-008), a confiança abaixo de 0,85 deixa o prazo "a confirmar", todo prazo nasce "a confirmar" e o advogado confirma. O conteúdo externo continua isolado contra injeção de prompt e os dados pessoais seguem minimizados.

## Alternativas

- **Só regras rápidas:** sem custo, mas sem reconhecer a maioria dos atos. As regras aprovadas pela curadoria cobrem poucos padrões.
- **Gemini gratuito com dados reais:** proibido (CLAUDE.md, seção 11).
- **Só Anthropic:** exige outra chave paga. Fica como primeira opção da ordem quando houver chave.

## Consequências

- A avaliação de 98% (`pnpm eval`) foi medida com o Claude. A acurácia do Gemini e da OpenAI ainda não é medida: falta gravar as respostas com `pnpm eval --gravar` usando casos anonimizados. Até lá, a classificação deles serve para sugerir o ato, e a confirmação humana de cada prazo continua obrigatória.
- As chaves ficam só no `.env` local (ignorado pelo git), nunca no repositório, em fixture ou em log.
- `GEMINI_PLANO=pago` só pode ser marcado depois de ativar o faturamento no projeto da chave, no Google AI Studio. Marcar sem faturamento expõe dados de clientes ao uso para treino.
