# apps/api

API REST NestJS 12 (`/v1`, Fastify): controllers HTTP e composição dos módulos. Nenhuma regra de negócio aqui (CLAUDE.md, seção 6).

## Rodar

```bash
pnpm infra:up
pnpm --filter @pz/api dev     # http://127.0.0.1:3000/v1/saude e /v1/docs
```

O `dev` lê `.env.example` e, se existir, o `.env` da raiz. Em produção: `pnpm build` gera `dist/` (esbuild, ver `pz-build-app`) e `pnpm start` sobe com `node --import ./dist/instrumentacao.js dist/main.js`.

## Padrões

| O quê             | Onde                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Ambiente validado | `src/ambiente.ts` (`@pz/config/env`); faltou variável, o processo não sobe                       |
| Observabilidade   | `src/instrumentacao.ts`, carregado com `--import` antes do main (ganchos ESM, OTel, Sentry)      |
| Correlação        | `x-request-id` aceito do balanceador ou gerado; rota informada ao trace (`registrarRotaHttp`)    |
| Erros             | `FiltroDeProblemas`: tudo vira `application/problem+json`; inesperado vira 500 + `registrarErro` |
| Validação         | `@Query({ schema })`, `@Body({ schema })` com os schemas de `@pz/contracts` (Standard Schema)    |
| Acesso            | Nega por padrão: rota sem `@Publico()` responde 401 até a HU06/HU07 (`@RequerPermissao`)         |
| Contrato          | `/v1/openapi.json` (o mesmo de `packages/contracts`); `/v1/docs` só fora de produção             |
| Sondas            | `/health/live` (processo) e `/health/ready` (banco, Redis, armazenamento)                        |

**Injeção sempre com `@Inject(Token)` explícito.** O build (esbuild) e o `dev` (tsx) não emitem os metadados de tipo dos decorators; sem `@Inject`, a dependência chega `undefined`. O teste de boot (`src/boot.test.ts`) sobe o processo real e pega esse erro.
