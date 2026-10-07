import { createVerify } from 'node:crypto';

import { ErroPermanente, ErroTransitorio, EventoEntrega } from '@pz/integracoes';
import { Instant } from '@pz/kernel';
import { z } from 'zod';

import type { ReceptorWebhook, RequisicaoWebhook } from '@pz/integracoes';

const ADAPTADOR = 'ses';
/** Só certificados e confirmações servidos pelo próprio SNS (evita assinatura forjada com outro certificado). */
const HOST_SNS = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

const Assinada = z.object({
  MessageId: z.string().min(1).max(200),
  TopicArn: z.string().min(1),
  Message: z.string(),
  Timestamp: z.string().min(1),
  SignatureVersion: z.enum(['1', '2']),
  Signature: z.string().min(1),
  SigningCertURL: z.string().min(1),
});
const MensagemSns = z.discriminatedUnion('Type', [
  Assinada.extend({ Type: z.literal('Notification'), Subject: z.string().optional() }),
  Assinada.extend({
    Type: z.enum(['SubscriptionConfirmation', 'UnsubscribeConfirmation']),
    Token: z.string().min(1),
    SubscribeURL: z.string().min(1),
  }),
]);
type MensagemSns = z.infer<typeof MensagemSns>;

const Destinatario = z.object({ emailAddress: z.string().min(1) });
/** Notificação do SES (notificações da identidade ou eventos do configuration set). */
const NotificacaoSes = z.object({
  notificationType: z.string().optional(),
  eventType: z.string().optional(),
  mail: z.object({
    messageId: z.string().min(1),
    timestamp: z.string(),
    commonHeaders: z.object({ messageId: z.string().min(1).optional() }).optional(),
  }),
  bounce: z
    .object({
      bounceType: z.string(),
      bounceSubType: z.string().optional(),
      bouncedRecipients: z.array(Destinatario),
      timestamp: z.string(),
    })
    .optional(),
  complaint: z
    .object({
      complainedRecipients: z.array(Destinatario),
      complaintFeedbackType: z.string().optional(),
      timestamp: z.string(),
    })
    .optional(),
  delivery: z.object({ timestamp: z.string(), recipients: z.array(z.string()) }).optional(),
  open: z.object({ timestamp: z.string() }).optional(),
  click: z.object({ timestamp: z.string() }).optional(),
  reject: z.object({ reason: z.string() }).optional(),
  failure: z.object({ errorMessage: z.string() }).optional(),
});
type NotificacaoSes = z.infer<typeof NotificacaoSes>;

export interface ConfiguracaoWebhooksSes {
  /** Tópicos SNS aceitos: assinatura válida de outro tópico da AWS não basta. */
  readonly topicos: readonly string[];
  /** HTTP do adaptador (certificado e confirmação de inscrição); injetável nos testes. */
  readonly http?: (
    url: string,
  ) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

/**
 * Webhooks de entrega do SES via SNS (HU30): o gateway `/v1/webhooks/ses` verifica a assinatura
 * do SNS e grava; o worker interpreta em eventos de entrega canônicos.
 */
export class WebhooksSes implements ReceptorWebhook {
  readonly #certificados = new Map<string, Promise<string>>();
  readonly #http: NonNullable<ConfiguracaoWebhooksSes['http']>;

  constructor(private readonly config: ConfiguracaoWebhooksSes) {
    this.#http = config.http ?? ((url) => fetch(url, { signal: AbortSignal.timeout(10_000) }));
  }

  async verificarAssinatura(requisicao: RequisicaoWebhook): Promise<boolean> {
    const mensagem = lerMensagem(requisicao);
    if (mensagem === undefined || !this.config.topicos.includes(mensagem.TopicArn)) return false;
    if (!urlDoSns(mensagem.SigningCertURL, '.pem')) return false;
    const certificado = await this.#certificado(mensagem.SigningCertURL);
    const verificador = createVerify(mensagem.SignatureVersion === '1' ? 'RSA-SHA1' : 'RSA-SHA256');
    verificador.update(textoAssinado(mensagem));
    try {
      return verificador.verify(certificado, mensagem.Signature, 'base64');
    } catch {
      // Certificado ilegível: assinatura não verificável é assinatura inválida (o gateway registra).
      return false;
    }
  }

  idExterno(requisicao: RequisicaoWebhook): string {
    const mensagem = lerMensagem(requisicao);
    if (mensagem === undefined) throw new ErroPermanente('mensagem SNS inválida', ADAPTADOR);
    return mensagem.MessageId;
  }

  /** Eventos de entrega do webhook (já verificado). Confirma a inscrição do tópico quando pedida. */
  async interpretar(requisicao: RequisicaoWebhook): Promise<EventoEntrega[]> {
    const mensagem = lerMensagem(requisicao);
    if (mensagem === undefined) throw new ErroPermanente('mensagem SNS inválida', ADAPTADOR);
    if (mensagem.Type === 'SubscriptionConfirmation') {
      if (!urlDoSns(mensagem.SubscribeURL)) {
        throw new ErroPermanente('SubscribeURL fora do SNS', ADAPTADOR);
      }
      const resposta = await this.#http(mensagem.SubscribeURL);
      if (!resposta.ok) {
        throw new ErroTransitorio(
          `confirmação de inscrição SNS: HTTP ${String(resposta.status)}`,
          ADAPTADOR,
        );
      }
      return [];
    }
    if (mensagem.Type === 'UnsubscribeConfirmation') {
      // Sem inscrição os eventos de entrega param de chegar: vai para a DLQ e alerta.
      throw new ErroPermanente(`inscrição SNS cancelada no tópico ${mensagem.TopicArn}`, ADAPTADOR);
    }
    let corpo: unknown;
    try {
      corpo = JSON.parse(mensagem.Message);
    } catch {
      throw new ErroPermanente('notificação SES não é JSON', ADAPTADOR);
    }
    const notificacao = NotificacaoSes.safeParse(corpo);
    if (!notificacao.success)
      throw new ErroPermanente('notificação SES fora do formato', ADAPTADOR);
    return z.array(EventoEntrega).parse(eventosDaNotificacao(notificacao.data));
  }

  #certificado(url: string): Promise<string> {
    let certificado = this.#certificados.get(url);
    if (certificado === undefined) {
      certificado = this.#http(url).then(async (resposta) => {
        if (!resposta.ok) {
          throw new ErroTransitorio(`certificado SNS: HTTP ${String(resposta.status)}`, ADAPTADOR);
        }
        return resposta.text();
      });
      // Falha não fica no cache: a próxima entrega tenta de novo.
      certificado.catch(() => this.#certificados.delete(url));
      this.#certificados.set(url, certificado);
    }
    return certificado;
  }
}

function lerMensagem(requisicao: RequisicaoWebhook): MensagemSns | undefined {
  try {
    const resultado = MensagemSns.safeParse(JSON.parse(new TextDecoder().decode(requisicao.corpo)));
    return resultado.success ? resultado.data : undefined;
  } catch {
    return undefined;
  }
}

function urlDoSns(texto: string, extensao?: string): boolean {
  try {
    const url = new URL(texto);
    return (
      url.protocol === 'https:' &&
      HOST_SNS.test(url.hostname) &&
      (extensao === undefined || url.pathname.endsWith(extensao))
    );
  } catch {
    return false;
  }
}

/** Texto que o SNS assina: pares "chave\nvalor\n" em ordem fixa, por tipo de mensagem. */
function textoAssinado(mensagem: MensagemSns): string {
  const campos: [string, string | undefined][] =
    mensagem.Type === 'Notification'
      ? [
          ['Message', mensagem.Message],
          ['MessageId', mensagem.MessageId],
          ['Subject', mensagem.Subject],
          ['Timestamp', mensagem.Timestamp],
          ['TopicArn', mensagem.TopicArn],
          ['Type', mensagem.Type],
        ]
      : [
          ['Message', mensagem.Message],
          ['MessageId', mensagem.MessageId],
          ['SubscribeURL', mensagem.SubscribeURL],
          ['Timestamp', mensagem.Timestamp],
          ['Token', mensagem.Token],
          ['TopicArn', mensagem.TopicArn],
          ['Type', mensagem.Type],
        ];
  return campos
    .filter((campo): campo is [string, string] => campo[1] !== undefined)
    .map(([chave, valor]) => `${chave}\n${valor}\n`)
    .join('');
}

/** O `Message-ID` original (o que o envio SMTP devolveu), sempre entre `<>`. */
function idDoEnvio(n: NotificacaoSes): string {
  const id = n.mail.commonHeaders?.messageId ?? n.mail.messageId;
  return `<${id.replace(/^<|>$/g, '')}>`;
}

function eventosDaNotificacao(n: NotificacaoSes): unknown[] {
  const idExterno = idDoEnvio(n);
  const em = (texto: string): Instant => Instant.deIso(texto);
  const enderecos = (lista: { emailAddress: string }[]): string[] =>
    lista.map((d) => d.emailAddress.trim().toLowerCase());
  const tipo = n.eventType ?? n.notificationType;
  switch (tipo) {
    case 'Bounce': {
      const bounce = exigir(n.bounce, tipo);
      return [
        {
          idExterno,
          // Só a rejeição permanente suprime o endereço; a temporária pode entregar depois.
          tipo: bounce.bounceType === 'Permanent' ? 'rejeitado' : 'falhou',
          ocorridoEm: em(bounce.timestamp),
          motivo: [bounce.bounceType, bounce.bounceSubType].filter(Boolean).join('/'),
          destinatarios: enderecos(bounce.bouncedRecipients),
        },
      ];
    }
    case 'Complaint': {
      const reclamacao = exigir(n.complaint, tipo);
      return [
        {
          idExterno,
          tipo: 'reclamacao',
          ocorridoEm: em(reclamacao.timestamp),
          motivo: reclamacao.complaintFeedbackType ?? 'spam',
          destinatarios: enderecos(reclamacao.complainedRecipients),
        },
      ];
    }
    case 'Delivery': {
      const entrega = exigir(n.delivery, tipo);
      return [{ idExterno, tipo: 'entregue', ocorridoEm: em(entrega.timestamp) }];
    }
    case 'Open':
      return [{ idExterno, tipo: 'aberto', ocorridoEm: em(exigir(n.open, tipo).timestamp) }];
    case 'Click':
      return [{ idExterno, tipo: 'clicado', ocorridoEm: em(exigir(n.click, tipo).timestamp) }];
    case 'Reject':
    case 'RenderingFailure':
      // O SES recusou o envio (ex.: vírus, template): falha do envio, não do endereço.
      return [
        {
          idExterno,
          tipo: 'falhou',
          ocorridoEm: em(n.mail.timestamp),
          motivo: (n.reject?.reason ?? n.failure?.errorMessage ?? tipo).slice(0, 500),
        },
      ];
    case 'Send':
    case 'DeliveryDelay':
      // Etapas intermediárias: o desfecho chega depois (Delivery ou Bounce).
      return [];
    default:
      throw new ErroPermanente(`notificação SES de tipo não tratado: ${String(tipo)}`, ADAPTADOR);
  }
}

function exigir<T>(valor: T | undefined, tipo: string): T {
  if (valor === undefined) throw new ErroPermanente(`notificação ${tipo} sem detalhe`, ADAPTADOR);
  return valor;
}
