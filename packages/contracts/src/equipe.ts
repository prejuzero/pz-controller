import { z } from 'zod';

import { definirRota, nomear } from './rota.js';

const PerfilDaEquipe = z.enum(['advogado', 'colaborador', 'admin_escritorio']);

const MembroBase = z.object({
  usuarioId: z.uuid(),
  nome: z.string(),
  email: z.string(),
  perfis: z.array(z.string()),
  criadoEm: z.iso.datetime(),
  desativadoEm: z.iso.datetime().nullable(),
});

const ConviteBase = z.object({
  id: z.uuid(),
  email: z.string(),
  nome: z.string(),
  perfil: PerfilDaEquipe,
  criadoEm: z.iso.datetime(),
  expiraEm: z.iso.datetime(),
});

export const EquipeDoEscritorio = nomear(
  'EquipeDoEscritorio',
  z.object({ membros: z.array(MembroBase), convites: z.array(ConviteBase) }),
);
export type EquipeDoEscritorio = z.infer<typeof EquipeDoEscritorio.esquema>;

export const PedidoDeConvite = nomear(
  'PedidoDeConvite',
  z.object({
    email: z.email().max(254),
    nome: z.string().trim().min(1).max(200),
    perfil: PerfilDaEquipe,
  }),
);
export type PedidoDeConvite = z.infer<typeof PedidoDeConvite.esquema>;

export const ConviteDeMembro = nomear('ConviteDeMembro', ConviteBase);
export type ConviteDeMembro = z.infer<typeof ConviteDeMembro.esquema>;

export const PedidoDePerfisDoMembro = nomear(
  'PedidoDePerfisDoMembro',
  z.object({ perfis: z.array(PerfilDaEquipe).min(1).max(3) }),
);

export const TokenDoConvite = nomear(
  'TokenDoConvite',
  z.object({ token: z.string().min(20).max(200) }),
);

export const ConviteDescrito = nomear(
  'ConviteDescrito',
  z.object({ nome: z.string(), email: z.string(), perfil: PerfilDaEquipe }),
);
export type ConviteDescrito = z.infer<typeof ConviteDescrito.esquema>;

export const AceiteDeConvite = nomear(
  'AceiteDeConvite',
  z.object({ token: z.string().min(20).max(200), senha: z.string().min(1).max(256) }),
);

export const consultarEquipe = definirRota({
  id: 'consultarEquipe',
  metodo: 'get',
  caminho: '/v1/equipe',
  resumo: 'Membros e convites abertos do escritório.',
  tag: 'equipe',
  resposta: { status: 200, corpo: EquipeDoEscritorio },
});

export const convidarMembro = definirRota({
  id: 'convidarMembro',
  metodo: 'post',
  caminho: '/v1/equipe/convites',
  resumo: 'Convida por e-mail (link de uso único, 7 dias).',
  tag: 'equipe',
  corpo: PedidoDeConvite,
  resposta: { status: 201, corpo: ConviteDeMembro },
  erros: [409],
});

export const cancelarConvite = definirRota({
  id: 'cancelarConvite',
  metodo: 'delete',
  caminho: '/v1/equipe/convites/{id}',
  resumo: 'Cancela um convite ainda não aceito.',
  tag: 'equipe',
  parametrosDeCaminho: z.object({ id: z.uuid() }),
  resposta: { status: 204, corpo: null },
  erros: [404],
});

export const alterarPerfisDoMembro = definirRota({
  id: 'alterarPerfisDoMembro',
  metodo: 'put',
  caminho: '/v1/equipe/membros/{id}/perfis',
  resumo: 'Define os perfis do membro (o escritório mantém ao menos um administrador).',
  tag: 'equipe',
  parametrosDeCaminho: z.object({ id: z.uuid() }),
  corpo: PedidoDePerfisDoMembro,
  resposta: { status: 204, corpo: null },
  erros: [404, 409],
});

export const desativarMembro = definirRota({
  id: 'desativarMembro',
  metodo: 'post',
  caminho: '/v1/equipe/membros/{id}/desativar',
  resumo: 'Desativa o membro e derruba as sessões dele na hora.',
  tag: 'equipe',
  parametrosDeCaminho: z.object({ id: z.uuid() }),
  resposta: { status: 204, corpo: null },
  erros: [404, 409],
});

export const descreverConvite = definirRota({
  id: 'descreverConvite',
  metodo: 'post',
  caminho: '/v1/equipe/convites/descrever',
  resumo: 'Para quem é o convite do link (sem sessão; o token vai no corpo).',
  tag: 'equipe',
  publica: true,
  corpo: TokenDoConvite,
  resposta: { status: 200, corpo: ConviteDescrito },
  erros: [401, 429],
});

export const aceitarConvite = definirRota({
  id: 'aceitarConvite',
  metodo: 'post',
  caminho: '/v1/equipe/convites/aceitar',
  resumo: 'Aceita o convite criando a senha; o 2FA é configurado no primeiro login.',
  tag: 'equipe',
  publica: true,
  corpo: AceiteDeConvite,
  resposta: { status: 204, corpo: null },
  erros: [401, 409, 429],
});

export const ROTAS_EQUIPE = [
  consultarEquipe,
  convidarMembro,
  cancelarConvite,
  alterarPerfisDoMembro,
  desativarMembro,
  descreverConvite,
  aceitarConvite,
] as const;
