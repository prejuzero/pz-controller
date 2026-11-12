import { z } from 'zod';

import { Uuid } from './comum.js';
import { nomear } from './rota.js';

/** Teto do lote: a carga da planilha da curadoria tem centenas de itens (686 eventos na V2). */
export const MAXIMO_DA_APROVACAO_EM_LOTE = 1000;

export const PedidoDeAprovacaoEmLote = nomear(
  'PedidoDeAprovacaoEmLote',
  z
    .object({
      ids: z
        .array(Uuid)
        .min(1)
        .max(MAXIMO_DA_APROVACAO_EM_LOTE)
        .describe('Rascunhos a aprovar; repetidos contam uma vez.'),
    })
    .strict(),
);
export type PedidoDeAprovacaoEmLote = z.infer<typeof PedidoDeAprovacaoEmLote.esquema>;

export const AprovacaoEmLote = nomear(
  'AprovacaoEmLote',
  z.object({
    aprovados: z.int().min(0),
    falhas: z
      .array(z.object({ id: Uuid, codigo: z.string() }))
      .describe('Cada item na própria transação: a falha de um não impede os outros.'),
  }),
);
export type AprovacaoEmLote = z.infer<typeof AprovacaoEmLote.esquema>;
