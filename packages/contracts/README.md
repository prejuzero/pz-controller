# packages/contracts

Schemas Zod da API `/v1` e dos eventos de domínio: fonte única da validação no NestJS, do OpenAPI 3.1 e dos clientes (ADR-009, ADR-015). Nada aqui é específico do portal web.

## Padrões (`src/comum.ts`)

| Padrão       | Contrato                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Erros        | `Problema`: RFC 9457 (`application/problem+json`) com `codigo` estável e `problemas` por campo             |
| Paginação    | `ConsultaPaginada` (`?cursor=&limite=`, padrão 20, máximo 100) e `pagina(item)` (`itens`, `proximoCursor`) |
| Idempotência | Rota com `idempotente: true` exige o cabeçalho `Idempotency-Key` (só POST)                                 |
| Datas        | `DataCivil` (`AAAA-MM-DD`, data existente) e `Instante` (ISO 8601 com fuso)                                |

## Nova rota

```ts
export const Processo = nomear('Processo', z.object({ id: Uuid, numero: z.string() }));

export const cadastrarProcesso = definirRota({
  id: 'cadastrarProcesso',
  metodo: 'post',
  caminho: '/v1/processos',
  resumo: 'Cadastra um processo.',
  tag: 'processos',
  idempotente: true,
  corpo: NovoProcesso,
  resposta: { status: 201, corpo: Processo },
  erros: [409],
});
```

Acrescente a rota em `ROTAS` (`src/index.ts`) e rode `pnpm --filter @pz/contracts gerar`. Todo schema de corpo ou resposta tem nome (`nomear`): vira `#/components/schemas/<Nome>` e um tipo no cliente. 401, 403, 500 e (quando há entrada) 400 são documentados automaticamente.

## Novo evento

```ts
export const PrazoConfirmado = definirEvento('PrazoConfirmado', 1, z.object({ prazoId: Uuid }));
```

Acrescente ao `EVENTOS` (`src/eventos/index.ts`). Mudança incompatível no payload exige nova versão (`definirEvento('PrazoConfirmado', 2, ...)`), publicada ao lado da anterior.

## Arquivos gerados (versionados)

- `openapi.json`: OpenAPI 3.1 da API. A API o serve em `/v1/openapi.json`.
- `gerado/api.d.ts`: tipos para `openapi-fetch` no portal (HU23) e no app.

O CI falha se os arquivos não estiverem em dia e roda o `oasdiff` contra a base do PR: qualquer quebra (remover ou renomear campo, mudar tipo, tornar obrigatório) bloqueia o merge. Quebra só em `/v2`.

## Clientes para outras plataformas (ADR-015)

O `openapi.json` é a fonte para qualquer linguagem. Exemplos com o OpenAPI Generator:

```bash
npx @openapitools/openapi-generator-cli generate -i packages/contracts/openapi.json -g kotlin -o cliente-kotlin
npx @openapitools/openapi-generator-cli generate -i packages/contracts/openapi.json -g swift5 -o cliente-swift
```

Clientes TypeScript (portal e app React Native) usam `gerado/api.d.ts` com `openapi-fetch`:

```ts
import createClient from 'openapi-fetch';
import type { paths } from '@pz/contracts/gerado/api';

const api = createClient<paths>({ baseUrl: 'https://api.prejuzero.com.br' });
const { data, error } = await api.GET('/v1/saude');
```
