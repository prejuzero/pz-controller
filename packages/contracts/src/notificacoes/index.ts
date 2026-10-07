import { z } from 'zod';

import { Instante, Uuid } from '../comum.js';
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

const Telefone = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/)
  .describe('Telefone E.164 (+5511...).');

export const PedidoDeConsentimento = nomear(
  'PedidoDeConsentimento',
  z
    .discriminatedUnion('canal', [
      z.object({ canal: z.literal('push'), destino: Uuid.describe('ID do dispositivo (app).') }),
      z.object({ canal: z.literal('whatsapp'), destino: Telefone }),
      z.object({ canal: z.literal('sms'), destino: Telefone }),
    ])
    .describe('O e-mail não entra: segue a base legal do serviço contratado.'),
);

export const ConsentimentoDoCanal = nomear(
  'ConsentimentoDoCanal',
  z.object({
    id: Uuid,
    canal: z.enum(['push', 'whatsapp', 'sms']),
    destino: z.string(),
    concedidoEm: Instante,
    origem: z.enum(['portal', 'app', 'mcp', 'integrador']),
  }),
);
export type ConsentimentoDoCanal = z.infer<typeof ConsentimentoDoCanal.esquema>;

export const ConsentimentosDoUsuario = nomear(
  'ConsentimentosDoUsuario',
  z.object({ itens: z.array(ConsentimentoDoCanal.esquema).describe('Só os ativos.') }),
);

export const PedidoDeDestinoPush = nomear(
  'PedidoDeDestinoPush',
  z.object({
    plataforma: z.enum(['ios', 'android', 'web']),
    token: z.string().min(1).max(4096).describe('Token de push do sistema do aparelho.'),
  }),
);

export const DestinoPushRegistrado = nomear(
  'DestinoPushRegistrado',
  z.object({ id: Uuid, dispositivoId: Uuid }),
);

const comId = z.object({ id: Uuid });

export const listarConsentimentos = definirRota({
  id: 'listarConsentimentos',
  metodo: 'get',
  caminho: '/v1/notificacoes/consentimentos',
  resumo: 'Consentimentos ativos do usuário por canal (push, WhatsApp, SMS).',
  tag: 'notificacoes',
  resposta: { status: 200, corpo: ConsentimentosDoUsuario },
});

/** Idempotente: o mesmo canal e destino já ativo devolve o existente. */
export const concederConsentimento = definirRota({
  id: 'concederConsentimento',
  metodo: 'post',
  caminho: '/v1/notificacoes/consentimentos',
  resumo: 'Registra o consentimento para receber avisos num canal e destino.',
  tag: 'notificacoes',
  corpo: PedidoDeConsentimento,
  resposta: { status: 201, corpo: ConsentimentoDoCanal },
  erros: [409],
});

/** O registro fica como prova (LGPD); o canal para de enviar. */
export const revogarConsentimento = definirRota({
  id: 'revogarConsentimento',
  metodo: 'delete',
  caminho: '/v1/notificacoes/consentimentos/{id}',
  resumo: 'Revoga o consentimento de um canal.',
  tag: 'notificacoes',
  parametrosDeCaminho: comId,
  resposta: { status: 204, corpo: null },
  erros: [404],
});

/** Só na sessão de um dispositivo (app, OAuth); o envio ainda exige o consentimento de push. */
export const registrarDestinoPush = definirRota({
  id: 'registrarDestinoPush',
  metodo: 'put',
  caminho: '/v1/notificacoes/destino-push',
  resumo: 'Registra ou atualiza o token de push do dispositivo da sessão.',
  tag: 'notificacoes',
  corpo: PedidoDeDestinoPush,
  resposta: { status: 200, corpo: DestinoPushRegistrado },
});

export const desativarDestinoPush = definirRota({
  id: 'desativarDestinoPush',
  metodo: 'delete',
  caminho: '/v1/notificacoes/destino-push',
  resumo: 'Desativa o push do dispositivo da sessão.',
  tag: 'notificacoes',
  resposta: { status: 204, corpo: null },
});

export const ROTAS_NOTIFICACOES = [
  consultarAvisosDeEntrega,
  listarConsentimentos,
  concederConsentimento,
  revogarConsentimento,
  registrarDestinoPush,
  desativarDestinoPush,
] as const;
