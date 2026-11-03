import { z } from 'zod';

import { FiltrosBusca } from '../busca.js';
import { Uuid } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

/** Teto de destinatários por envio (HU32). */
export const MAXIMO_DE_DESTINATARIOS_DO_ENVIO = 10;

const Formato = z.enum(['pdf', 'xlsx']).default('pdf');
const Comum = {
  destinatarios: z
    .array(z.email().max(254))
    .min(1)
    .max(MAXIMO_DE_DESTINATARIOS_DO_ENVIO)
    .describe('E-mails de quem recebe; até 10.'),
  mensagem: z.string().trim().max(1000).optional().describe('Texto livre de quem envia.'),
  confirmacaoSigilo: z
    .boolean()
    .optional()
    .describe(
      'Obrigatória (true) quando algum destinatário não é e-mail de usuário do escritório: confirma o envio de dados sob sigilo profissional para fora (RF70).',
    ),
};

/**
 * Envio manual por e-mail (HU32, RF68–RF70): o prazo, a publicação, o resultado de uma busca ou
 * um relatório já pedido, com o arquivo em anexo gerado pelo pipeline de relatórios.
 */
export const PedidoDeEnvio = nomear(
  'PedidoDeEnvio',
  z.discriminatedUnion('recurso', [
    z
      .object({
        recurso: z.enum(['prazo', 'publicacao']),
        recursoId: Uuid,
        formato: Formato,
        ...Comum,
      })
      .strict(),
    z.object({ recurso: z.literal('relatorio'), recursoId: Uuid, ...Comum }).strict(),
    z
      .object({
        recurso: z.literal('busca'),
        alvo: z.enum(['prazos', 'publicacoes']),
        filtros: FiltrosBusca.esquema.omit({ cursor: true, limite: true }),
        formato: Formato,
        ...Comum,
      })
      .strict(),
  ]),
);
export type PedidoDeEnvio = z.input<typeof PedidoDeEnvio.esquema>;

export const EnvioSolicitado = nomear(
  'EnvioSolicitado',
  z.object({
    id: Uuid,
    externos: z
      .array(z.string())
      .describe('Destinatários de fora do escritório (enviados com a confirmação de sigilo).'),
  }),
);
export type EnvioSolicitado = z.infer<typeof EnvioSolicitado.esquema>;

export const enviarPorEmail = definirRota({
  id: 'enviarPorEmail',
  metodo: 'post',
  caminho: '/v1/envios',
  resumo:
    'Envia prazo, publicação, busca ou relatório por e-mail com anexo; o arquivo é gerado e enviado em segundo plano. Destinatário de fora do escritório exige confirmacaoSigilo (422 "confirmacao-de-sigilo").',
  tag: 'notificacoes',
  corpo: PedidoDeEnvio,
  resposta: { status: 202, corpo: EnvioSolicitado },
  erros: [404, 422, 429],
});
