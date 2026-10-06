import { z } from 'zod';

import { Instante, LinkHttps } from '../canonicos.js';

import type { SaudeAdaptador } from '../canonicos.js';
import type { RequisicaoWebhook } from '../webhook.js';

/**
 * Mensagem de notificação no modelo canônico, igual para e-mail, push, WhatsApp e SMS.
 * Leva o mínimo do processo: avisa e aponta para o portal ou app (CLAUDE.md, 10).
 */
export const MensagemNotificacao = z
  .object({
    /** Chave de idempotência: a mesma chave nunca gera dois envios. */
    idempotencia: z.string().min(1).max(200),
    /** Endereço no canal (e-mail, token do dispositivo, telefone E.164). */
    destinatario: z.string().min(1),
    /** Template aprovado no provedor, quando o canal exige (ex.: WhatsApp). */
    template: z
      .object({ id: z.string().min(1), variaveis: z.record(z.string(), z.string()) })
      .strict()
      .optional(),
    assunto: z.string().max(200).optional(),
    texto: z.string().min(1),
    link: LinkHttps,
    botoes: z
      .array(z.object({ rotulo: z.string().min(1).max(40), link: LinkHttps }).strict())
      .max(3)
      .optional(),
  })
  .strict();
export type MensagemNotificacao = z.infer<typeof MensagemNotificacao>;

export const ResultadoEnvio = z
  .object({
    /** ID do envio no provedor, para correlacionar os eventos de entrega. */
    idExterno: z.string().min(1),
    aceitoEm: Instante,
  })
  .strict();
export type ResultadoEnvio = z.infer<typeof ResultadoEnvio>;

export const EventoEntrega = z
  .object({
    idExterno: z.string().min(1),
    tipo: z.enum(['entregue', 'aberto', 'clicado', 'rejeitado', 'reclamacao', 'falhou']),
    ocorridoEm: Instante,
    motivo: z.string().max(500).optional(),
  })
  .strict();
export type EventoEntrega = z.infer<typeof EventoEntrega>;

/** Capacidades que o descritor de todo canal declara (HU09, ajuste ADR-015/016). */
export const CapacidadesCanal = z
  .object({
    exigeTemplateAprovado: z.boolean(),
    /** Janela de conversa do provedor (ex.: 24 h no WhatsApp); 0 = sem janela. */
    janelaDeConversaHoras: z.number().int().nonnegative(),
    tamanhoMaximo: z.number().int().positive(),
    suportaBotoes: z.boolean(),
    suportaMidia: z.boolean(),
  })
  .strict();
export type CapacidadesCanal = z.infer<typeof CapacidadesCanal>;

/** Canal de notificação (e-mail, push, WhatsApp, SMS). Exige consentimento registrado por usuário. */
export interface CanalNotificacao {
  enviar(mensagem: MensagemNotificacao): Promise<ResultadoEnvio>;
  /** Converte o webhook do provedor (já com assinatura verificada) em eventos de entrega. */
  interpretarWebhook(requisicao: RequisicaoWebhook): Promise<EventoEntrega[]>;
  saude(): Promise<SaudeAdaptador>;
}
