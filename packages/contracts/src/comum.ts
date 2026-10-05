import { z } from 'zod';

/**
 * Padrões comuns de todos os contratos `/v1` (ADR-009). Neutros de plataforma (ADR-015):
 * nada aqui é específico do portal web.
 */

export const Uuid = z.uuid();

/** Data civil (prazos, datas jurídicas): `AAAA-MM-DD`, data existente. */
export const DataCivil = z.iso.date();

/** Instante em ISO 8601 com fuso explícito (normalmente UTC, `Z`). */
export const Instante = z.iso.datetime({ offset: true });

/** Erro no formato RFC 9457 (`application/problem+json`). */
export const Problema = z.object({
  type: z.string().describe('URI que identifica o tipo do problema.'),
  title: z.string().describe('Resumo legível, em pt-BR.'),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  codigo: z.string().describe('Código estável do erro (ex.: prazo.ja-confirmado).'),
  problemas: z
    .array(z.object({ campo: z.string(), mensagem: z.string() }))
    .optional()
    .describe('Problemas por campo, nos erros de validação.'),
  requestId: z.string().optional(),
});
export type Problema = z.infer<typeof Problema>;

export const LIMITE_PADRAO = 20;
export const LIMITE_MAXIMO = 100;

/** Paginação por cursor: `?cursor=&limite=`. O cursor é opaco para o cliente. */
export const ConsultaPaginada = z.object({
  cursor: z.string().min(1).optional().describe('Cursor devolvido na página anterior.'),
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIMITE_MAXIMO)
    .default(LIMITE_PADRAO)
    .describe('Quantidade de itens por página.'),
});

export function pagina<Item extends z.ZodType>(item: Item) {
  return z.object({
    itens: z.array(item),
    proximoCursor: z.string().nullable().describe('Nulo quando não há mais páginas.'),
  });
}

/** Cabeçalho exigido em POSTs sensíveis: a mesma chave nunca executa a operação duas vezes. */
export const CABECALHO_IDEMPOTENCIA = 'Idempotency-Key';
export const ChaveIdempotencia = z.string().min(8).max(255);
