import { z } from 'zod';

import { DataCivil, Instante, Uuid } from './comum.js';
import { definirRota, nomear } from './rota.js';

const Token = z
  .string()
  .min(20)
  .max(200)
  .describe('Token do link do e-mail (vai no corpo, nunca na URL da API).');

export const PedidoComToken = nomear('PedidoComToken', z.object({ token: Token }).strict());

export const LinkDeCiencia = nomear(
  'LinkDeCiencia',
  z.object({
    situacao: z
      .enum(['valido', 'usado', 'expirado', 'substituido', 'invalido'])
      .describe('"substituido": um e-mail mais novo trouxe outro link.'),
    prazo: z
      .object({
        numeroProcesso: z.string(),
        tipoAto: z.string(),
        vencimento: DataCivil.nullable(),
      })
      .optional()
      .describe('Só o necessário para conferir antes de confirmar.'),
    confirmadaEm: Instante.optional(),
  }),
);
export type LinkDeCiencia = z.infer<typeof LinkDeCiencia.esquema>;

export const CienciaRegistrada = nomear(
  'CienciaRegistrada',
  z.object({
    prazoId: Uuid,
    confirmadaEm: Instante.describe('Horário do servidor.'),
    jaConfirmada: z.boolean().describe('Já havia ciência: nada novo foi gravado.'),
  }),
);
export type CienciaRegistrada = z.infer<typeof CienciaRegistrada.esquema>;

export const consultarLinkDeCiencia = definirRota({
  id: 'consultarLinkDeCiencia',
  metodo: 'post',
  caminho: '/v1/ciencia/consulta',
  resumo: 'Mostra o prazo do link de ciência (não confirma nada). Pública, com limite por IP.',
  tag: 'ciencia',
  corpo: PedidoComToken,
  resposta: { status: 200, corpo: LinkDeCiencia },
});

export const confirmarCienciaPeloLink = definirRota({
  id: 'confirmarCienciaPeloLink',
  metodo: 'post',
  caminho: '/v1/ciencia/confirmacao',
  resumo: 'Confirma a ciência com o token do e-mail (uso único). Pública, com limite por IP.',
  tag: 'ciencia',
  corpo: PedidoComToken,
  resposta: { status: 200, corpo: CienciaRegistrada },
  erros: [401, 404, 409],
});

export const confirmarCiencia = definirRota({
  id: 'confirmarCiencia',
  metodo: 'post',
  caminho: '/v1/prazos/{id}/ciencia',
  resumo: 'Confirma a ciência do prazo pela sessão (portal ou app).',
  tag: 'ciencia',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 200, corpo: CienciaRegistrada },
  erros: [404, 409],
});

export const ROTAS_CIENCIA = [
  consultarLinkDeCiencia,
  confirmarCienciaPeloLink,
  confirmarCiencia,
] as const;
