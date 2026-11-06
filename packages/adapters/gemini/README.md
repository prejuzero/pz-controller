# @pz/adapter-gemini

Adaptador `ProvedorIA` do Google Gemini (ADR-005, ADR-016, **ADR-022**). Provedor **alternativo**, só para a validação local com **dados fictícios**: o plano gratuito pode usar o conteúdo para treino, e dados de clientes nunca podem ir para lá (CLAUDE.md, seção 11). O padrão do produto continua sendo o Claude.

- API REST `generateContent` (`https://generativelanguage.googleapis.com/v1beta`), sem SDK. Chave no cabeçalho `x-goog-api-key`, nunca na URL.
- Saída estruturada: `responseMimeType: application/json` com `responseJsonSchema` gerado do schema Zod de quem chama, validada de novo aqui. Partes de raciocínio (`thought`) ficam fora da saída; os tokens delas contam como saída.
- Erros: 401/403 credencial, 429 cota, 5xx (o 503 "alta demanda" é comum), 408 e 404 sem corpo são passageiros; o resto é permanente. Ferramentas não são suportadas.

## Configuração (worker)

| Variável                 | Uso                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`         | Chave (só no `.env` local)                                                                 |
| `GEMINI_MODELO`          | Modelo de todas as tarefas (padrão `gemini-3.5-flash`)                                     |
| `IA_DADOS_FICTICIOS=sim` | Obrigatória: declara que o banco local só tem dados fictícios. Sem ela, o Gemini não liga. |

Com `ANTHROPIC_API_KEY` definida, a Anthropic tem preferência.

## Testes

- Unitários: requisição, conversão, erros e saúde, com `fetch` simulado.
- Contrato (`pnpm test:int`): `verificarContratoIa` contra um servidor local com `fixtures/` no formato observado em 06/11/2026 (conteúdo FICTÍCIO). Sem rede externa.
