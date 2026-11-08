# apps/mcp

Servidor MCP (Model Context Protocol) do PrejuZero (HU60, ADR-015, ADR-016): expõe o catálogo de ferramentas de IA (HU59) a assistentes externos (Claude, ChatGPT, Copilot e outros).

Implementado em: HU60 (PR 1: servidor e catálogo pela API; PR 2: descoberta OAuth, registro dinâmico de clientes e conexões em Configurações). Siga o [CLAUDE.md](/CLAUDE.md) e os ADRs citados.

## Como funciona

- **Só pela API:** o servidor não tem regra, banco nem IA. Lista e executa as ferramentas por `GET /v1/ia/ferramentas` e `POST /v1/ia/ferramentas/{nome}`, com o cliente gerado do OpenAPI e o token do próprio assistente. Escritório, usuário e permissões saem do token, na API (regra de fronteira `mcp-so-pela-api`).
- **Só leitura:** o catálogo recusa ferramentas que alteram estado (ADR-016). Cada chamada fica na trilha (`ia.ferramenta-executada`, canal `mcp`) e conta na cota por usuário (60 por minuto) e na do cliente OAuth.
- **Aviso sobre datas:** toda resposta leva o aviso de que as datas vêm do motor de prazos e só valem depois da confirmação do advogado.
- **Transporte:** Streamable HTTP sem estado em `POST /mcp` (respostas em JSON). Sem token, ou com token recusado pela API, responde 401 com `WWW-Authenticate: Bearer`. `GET /health/live` para a saúde.

## Rodar localmente

```
pnpm --filter @pz/mcp dev   # MCP_PORTA (3004) e MCP_API_URL (http://127.0.0.1:3000)
```

O token é um token de acesso OAuth da API (HU49). A conexão direta pelos assistentes, com descoberta e registro dinâmico, entra no PR 2.

## Dependência

`@modelcontextprotocol/sdk` (oficial, MIT, versão fixada): implementação mantida do protocolo e dos transportes, em vez de JSON-RPC próprio (decisão do usuário em 08/11/2026). Traz express e hono como dependências transitivas, que este servidor não usa (o transporte é o de `Request`/`Response` padrão da web).
