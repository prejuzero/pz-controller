import { z } from 'zod';

import { catalogoDeEventos, definirEvento } from './evento.js';

export { catalogoDeEventos, definirEvento } from './evento.js';
export type { ContratoEvento } from './evento.js';

/** Exemplo do módulo "saude": emitido a cada verificação da situação da API. */
export const SituacaoVerificada = definirEvento(
  'SituacaoVerificada',
  1,
  z.object({ situacao: z.enum(['operacional', 'degradada']) }),
);

/** Pedido de redefinição de senha (HU06): o token vai cifrado; o worker envia o e-mail. */
export const RedefinicaoDeSenhaSolicitada = definirEvento(
  'RedefinicaoDeSenhaSolicitada',
  1,
  z.object({ usuarioId: z.uuid(), tokenCifrado: z.string().min(1) }),
);

/** Conta ou 2FA bloqueado por tentativas erradas (HU06): o titular é avisado por e-mail. */
export const ContaBloqueada = definirEvento(
  'ContaBloqueada',
  1,
  z.object({
    usuarioId: z.uuid(),
    motivo: z.enum(['login', 'segundo-fator']),
    bloqueadaAte: z.iso.datetime(),
  }),
);

/** O calendário de uma jurisdição mudou (HU13): o motor recalcula e o cache é invalidado. */
export const CalendarioAlterado = definirEvento(
  'CalendarioAlterado',
  1,
  z.object({
    eventoId: z.uuid(),
    origem: z.enum(['global', 'local']),
    acao: z.enum(['incluido', 'revogado']),
    abrangencia: z.enum(['nacional', 'uf', 'municipio', 'tribunal', 'comarca']),
    uf: z.string().optional(),
    municipioIbge: z.string().optional(),
    tribunal: z.string().optional(),
    comarca: z.string().optional(),
    inicio: z.iso.date(),
    fim: z.iso.date(),
    usuarioId: z.uuid(),
  }),
);

/** Verificação do e-mail pedida no cadastro (HU11): o token vai cifrado; o worker envia o link. */
export const VerificacaoDeEmailSolicitada = definirEvento(
  'VerificacaoDeEmailSolicitada',
  1,
  z.object({ usuarioId: z.uuid(), tokenCifrado: z.string().min(1) }),
);

/** Advogado cadastrado (HU11): tenant autônomo, conta e advogado criados juntos. */
export const AdvogadoCadastrado = definirEvento(
  'AdvogadoCadastrado',
  1,
  z.object({ advogadoId: z.uuid(), usuarioId: z.uuid() }),
);

/** OAB entrou no cadastro (HU11): a captura passa a monitorá-la. */
export const OabAdicionada = definirEvento(
  'OabAdicionada',
  1,
  z.object({
    advogadoId: z.uuid(),
    oabId: z.uuid(),
    numero: z.string().min(1),
    uf: z.string().length(2),
    tipo: z.enum(['principal', 'suplementar']),
  }),
);

/** OAB saiu do cadastro (HU11): a captura deixa de monitorá-la. */
export const OabRemovida = definirEvento(
  'OabRemovida',
  1,
  z.object({
    advogadoId: z.uuid(),
    oabId: z.uuid(),
    numero: z.string().min(1),
    uf: z.string().length(2),
  }),
);

const Cobertura = z.enum(['automatica', 'parcial', 'manual']);

/** Processo entrou no monitoramento (HU12), pelo advogado ou pela captura. */
export const ProcessoMonitorado = definirEvento(
  'ProcessoMonitorado',
  1,
  z.object({
    processoId: z.uuid(),
    numeroCnj: z.string().regex(/^\d{20}$/),
    tribunal: z.string().nullable(),
    origem: z.enum(['manual', 'captura']),
  }),
);

/** Cobertura do processo mudou (HU12, RF91): a captura e os lembretes de conferência reagem. */
export const CoberturaAlterada = definirEvento(
  'CoberturaAlterada',
  1,
  z.object({
    processoId: z.uuid(),
    numeroCnj: z.string().regex(/^\d{20}$/),
    antes: Cobertura,
    depois: Cobertura,
    motivo: z.string().nullable(),
  }),
);

/** Notificação pedida (HU30): o worker renderiza o template e envia pelo canal. */
export const NotificacaoSolicitada = definirEvento(
  'NotificacaoSolicitada',
  1,
  z.object({
    notificacaoId: z.uuid(),
    canal: z.enum(['email', 'push', 'whatsapp', 'sms']),
    tipo: z.string().min(1),
  }),
);

const DaNotificacao = z.object({
  notificacaoId: z.uuid(),
  usuarioId: z.uuid(),
  canal: z.enum(['email', 'push', 'whatsapp', 'sms']),
  tipo: z.string().min(1),
});

/** O provedor confirmou a entrega (webhook, HU30). */
export const NotificacaoEntregue = definirEvento('NotificacaoEntregue', 1, DaNotificacao);

/**
 * A notificação não chegou (HU30): endereço rejeitado (bounce), marcada como spam ou falha do
 * envio. Bounce e spam já entraram na lista de supressão; gera aviso ao usuário e ao administrador.
 */
export const NotificacaoRejeitada = definirEvento(
  'NotificacaoRejeitada',
  1,
  DaNotificacao.extend({
    motivo: z.enum(['bounce', 'spam', 'falha']),
    detalhe: z.string().max(500).optional(),
  }),
);

/** Consentimento de um canal (push, WhatsApp, SMS) concedido ou revogado (HU30); sem o destino. */
export const ConsentimentoCanalAlterado = definirEvento(
  'ConsentimentoCanalAlterado',
  1,
  z.object({
    consentimentoId: z.uuid(),
    usuarioId: z.uuid(),
    canal: z.enum(['push', 'whatsapp', 'sms']),
    situacao: z.enum(['concedido', 'revogado']),
  }),
);

export const EVENTOS = catalogoDeEventos(
  SituacaoVerificada,
  RedefinicaoDeSenhaSolicitada,
  ContaBloqueada,
  CalendarioAlterado,
  AdvogadoCadastrado,
  OabAdicionada,
  OabRemovida,
  ProcessoMonitorado,
  CoberturaAlterada,
  VerificacaoDeEmailSolicitada,
  NotificacaoSolicitada,
  NotificacaoEntregue,
  NotificacaoRejeitada,
  ConsentimentoCanalAlterado,
);
