# @pz/adapter-openai

Adaptador `ProvedorIA` da OpenAI (ADR-005, ADR-016, ADR-024) pela API REST `/chat/completions`, sem SDK. A saída estruturada vem por `response_format` (JSON Schema gerado do Zod) e é validada de novo aqui. A chave (`OPENAI_API_KEY`) vai no cabeçalho `Authorization`, nunca na URL, em fixture ou em log. A API não usa os dados para treino por padrão.

O modelo vem de `OPENAI_MODELO` e a ordem entre provedores de `IA_PROVEDORES`. Não envia temperatura: os modelos de raciocínio só aceitam a padrão.
