import { z } from 'zod';

import { definirRota, nomear } from '../rota.js';

export const AvisosDeEntrega = nomear(
  'AvisosDeEntrega',
  z.object({
    emailsRejeitados: z
      .array(z.string())
      .describe(
        'E-mails do usuário que rejeitaram mensagens (bounce) ou marcaram spam: não recebem notificações até serem trocados ou liberados pelo suporte.',
      ),
    usuariosDaEquipeComRejeicao: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe(
        'Usuários do escritório com notificação rejeitada nos últimos 7 dias; null para quem não administra a equipe (`usuarios:gerir`).',
      ),
  }),
);
export type AvisosDeEntrega = z.infer<typeof AvisosDeEntrega.esquema>;

/** Avisos de entrega para a faixa do portal (HU30): rejeição gera aviso ao usuário e ao administrador. */
export const consultarAvisosDeEntrega = definirRota({
  id: 'consultarAvisosDeEntrega',
  metodo: 'get',
  caminho: '/v1/notificacoes/avisos',
  resumo: 'E-mails do usuário rejeitados e, para quem administra, colegas com rejeição recente.',
  tag: 'notificacoes',
  resposta: { status: 200, corpo: AvisosDeEntrega },
});

export const ROTAS_NOTIFICACOES = [consultarAvisosDeEntrega] as const;
