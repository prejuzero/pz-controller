import type { z } from 'zod';

/** Schema com nome: vira `#/components/schemas/<nome>` no OpenAPI e um tipo no cliente gerado. */
export interface EsquemaNomeado<Esquema extends z.ZodType = z.ZodType> {
  readonly nome: string;
  readonly esquema: Esquema;
}

export function nomear<Esquema extends z.ZodType>(
  nome: string,
  esquema: Esquema,
): EsquemaNomeado<Esquema> {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(nome)) {
    throw new Error(`Nome de schema deve ser PascalCase: "${nome}"`);
  }
  return { nome, esquema };
}

export type MetodoHttp = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Status de erro documentados por rota além dos padrões (401, 403, 500 e 400 quando há entrada). */
/** 401 em rota pública: credencial do chamador inválida (ex.: assinatura de webhook). */
export type StatusDeErro = 401 | 404 | 409 | 422 | 429;

export interface Rota {
  /** Identificador único da operação (operationId), em camelCase. */
  readonly id: string;
  readonly metodo: MetodoHttp;
  /** Sempre sob `/v1`; parâmetros de caminho como `{id}`. */
  readonly caminho: string;
  readonly resumo: string;
  readonly tag: string;
  /** Rota sem autenticação (`@Publico()` na API). */
  readonly publica?: boolean;
  /** Exige o cabeçalho `Idempotency-Key`. */
  readonly idempotente?: boolean;
  readonly parametrosDeCaminho?: z.ZodObject;
  readonly consulta?: z.ZodObject;
  readonly corpo?: EsquemaNomeado;
  /** Resposta de sucesso. `null` para 204 sem corpo. */
  readonly resposta: {
    readonly status: 200 | 201 | 202 | 204;
    readonly corpo: EsquemaNomeado | null;
  };
  readonly erros?: readonly StatusDeErro[];
}

/** Valida a rota na definição: um contrato errado falha no import, não em produção. */
export function definirRota<R extends Rota>(rota: R): R {
  if (!rota.caminho.startsWith('/v1/')) {
    throw new Error(`Rota ${rota.id}: o caminho deve começar com /v1/ (ADR-009)`);
  }
  if (!/^[a-z][A-Za-z0-9]*$/.test(rota.id)) {
    throw new Error(`Rota ${rota.id}: o id deve ser camelCase`);
  }
  if (rota.idempotente === true && rota.metodo !== 'post') {
    throw new Error(`Rota ${rota.id}: Idempotency-Key só se aplica a POST`);
  }
  const parametros = [...rota.caminho.matchAll(/\{(\w+)\}/g)].map((parte) => parte[1]);
  const declarados = Object.keys(rota.parametrosDeCaminho?.shape ?? {});
  if (parametros.join(',') !== declarados.join(',')) {
    throw new Error(`Rota ${rota.id}: parâmetros do caminho e de parametrosDeCaminho não batem`);
  }
  return rota;
}
