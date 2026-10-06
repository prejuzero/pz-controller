# apps/web

Portal Next.js (App Router, webpack) com Tailwind, `@pz/ui` e TanStack Query. Fala com o back-end só pela API `/v1`, na mesma origem: o Next.js encaminha `/v1/*` para `API_URL` (padrão `http://localhost:3000`), e os cookies `__Host-` da sessão funcionam sem CORS.

```bash
pnpm --filter @pz/web dev   # http://localhost:3001 (com a API no ar: pnpm dev sobe tudo)
```

## Organização

| Onde                 | O quê                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `src/api/cliente.ts` | Único acesso HTTP: `openapi-fetch` com os tipos de `@pz/contracts/gerado/api` + CSRF      |
| `src/api/chaves.ts`  | Chaves de cache por recurso (`[recurso, ...escopo]`); invalide `chaves.<recurso>.todas`   |
| `src/api/<recurso>`  | `queryOptions` e mutações do recurso; `hooks.ts` só os repassa ao React                   |
| `src/api/cache.ts`   | Erros globais: 401 → `/entrar?motivo=sessao-expirada`; mutação → toast; consulta → página |
| `src/proxy.ts`       | Rota protegida sem cookie de sessão → `/entrar?retorno=<url>` (só caminhos internos)      |
| `src/i18n`           | next-intl: catálogo em `src/mensagens/pt-BR.json`, fuso `America/Sao_Paulo`, formatação   |

Regras:

- `fetch`, `XMLHttpRequest` e bibliotecas HTTP são proibidos pelo lint: use o cliente gerado.
- Textos só pelo catálogo (`useTranslations`/`getTranslations`); chave inexistente não compila.
- `DataCivil` (AAAA-MM-DD) se formata sem fuso (`formatarDataCivil`); instantes, no fuso de exibição ou no do juízo (`formatarInstante`).
- Sentry no navegador só com `NEXT_PUBLIC_SENTRY_DSN`, sem dados pessoais.
