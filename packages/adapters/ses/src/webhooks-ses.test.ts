import { createSign, generateKeyPairSync } from 'node:crypto';

import { ErroPermanente, ErroTransitorio } from '@pz/integracoes';
import { describe, expect, it, vi } from 'vitest';

import { WebhooksSes } from './webhooks-ses.js';

import type { RequisicaoWebhook } from '@pz/integracoes';

const TOPICO = 'arn:aws:sns:sa-east-1:000000000000:pz-entregas';
const CERT = 'https://sns.sa-east-1.amazonaws.com/SimpleNotificationService-teste.pem';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

type Campos = Record<string, string>;

function assinar(campos: Campos, versao: '1' | '2' = '2'): Campos {
  const ordem =
    campos.Type === 'Notification'
      ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  const texto = ordem
    .filter((k) => campos[k] !== undefined)
    .map((k) => `${k}\n${String(campos[k])}\n`)
    .join('');
  const assinatura = createSign(versao === '1' ? 'RSA-SHA1' : 'RSA-SHA256')
    .update(texto)
    .sign(privateKey, 'base64');
  return { ...campos, SignatureVersion: versao, Signature: assinatura, SigningCertURL: CERT };
}

function requisicao(corpo: unknown): RequisicaoWebhook {
  return { cabecalhos: {}, corpo: new TextEncoder().encode(JSON.stringify(corpo)) };
}

function notificacao(mensagem: unknown, extra: Campos = {}): Campos {
  return assinar({
    Type: 'Notification',
    MessageId: 'sns-1',
    TopicArn: TOPICO,
    Message: JSON.stringify(mensagem),
    Timestamp: '2026-10-07T12:00:00.000Z',
    ...extra,
  });
}

const MAIL = {
  messageId: '0100-ses',
  timestamp: '2026-10-07T11:59:00.000Z',
  commonHeaders: { messageId: 'abc@prejuzero.local' },
};

function criar(http = vi.fn((url: string) => Promise.resolve(resposta(url === CERT ? PEM : '')))) {
  return { webhooks: new WebhooksSes({ topicos: [TOPICO], http }), http };
}

function resposta(texto: string, status = 200) {
  return { ok: status < 400, status, text: () => Promise.resolve(texto) };
}

describe('WebhooksSes: assinatura do SNS', () => {
  it('aceita assinatura v1 e v2 válidas e baixa o certificado uma vez', async () => {
    const { webhooks, http } = criar();
    const v2 = notificacao({ notificationType: 'Delivery' }, { Subject: 'x' });
    expect(await webhooks.verificarAssinatura(requisicao(v2))).toBe(true);
    const v1 = assinar({ ...v2, SignatureVersion: '1' }, '1');
    expect(await webhooks.verificarAssinatura(requisicao(v1))).toBe(true);
    expect(http).toHaveBeenCalledTimes(1);
    expect(webhooks.idExterno(requisicao(v2))).toBe('sns-1');
  });

  it('recusa corpo alterado, tópico desconhecido, certificado fora do SNS e corpo inválido', async () => {
    const { webhooks } = criar();
    const valida = notificacao({ notificationType: 'Delivery' });
    const casos = [
      { ...valida, Message: '{"adulterado":true}' },
      assinar({ ...valida, TopicArn: 'arn:aws:sns:sa-east-1:1:outro' }),
      { ...valida, SigningCertURL: 'https://sns.evil.com/cert.pem' },
      { ...valida, SigningCertURL: 'http://sns.sa-east-1.amazonaws.com/c.pem' },
      { ...valida, SigningCertURL: 'https://sns.sa-east-1.amazonaws.com/c.txt' },
      { ...valida, SigningCertURL: 'não é url' },
    ];
    for (const caso of casos)
      expect(await webhooks.verificarAssinatura(requisicao(caso))).toBe(false);
    const lixo: RequisicaoWebhook = { cabecalhos: {}, corpo: new TextEncoder().encode('{') };
    expect(await webhooks.verificarAssinatura(lixo)).toBe(false);
    expect(() => webhooks.idExterno(lixo)).toThrow(ErroPermanente);
  });

  it('certificado ilegível é assinatura inválida; indisponível é erro transitório e tenta de novo', async () => {
    const ilegivel = criar(vi.fn(() => Promise.resolve(resposta('lixo'))));
    const valida = notificacao({ notificationType: 'Delivery' });
    expect(await ilegivel.webhooks.verificarAssinatura(requisicao(valida))).toBe(false);

    const http = vi
      .fn()
      .mockResolvedValueOnce(resposta('', 503))
      .mockResolvedValueOnce(resposta(PEM));
    const { webhooks } = criar(http);
    await expect(webhooks.verificarAssinatura(requisicao(valida))).rejects.toBeInstanceOf(
      ErroTransitorio,
    );
    expect(await webhooks.verificarAssinatura(requisicao(valida))).toBe(true);
  });
});

describe('WebhooksSes: interpretação', () => {
  const { webhooks } = criar();
  const interpretar = (mensagem: unknown) =>
    webhooks.interpretar(requisicao(notificacao(mensagem)));

  it('rejeição permanente vira "rejeitado" com os endereços; temporária vira "falhou"', async () => {
    const bounce = (bounceType: string) => ({
      notificationType: 'Bounce',
      mail: MAIL,
      bounce: {
        bounceType,
        bounceSubType: 'General',
        bouncedRecipients: [{ emailAddress: ' Ana@Exemplo.invalid ' }],
        timestamp: '2026-10-07T12:00:01.000Z',
      },
    });
    const [permanente] = await interpretar(bounce('Permanent'));
    expect(permanente).toMatchObject({
      idExterno: '<abc@prejuzero.local>',
      tipo: 'rejeitado',
      motivo: 'Permanent/General',
      destinatarios: ['ana@exemplo.invalid'],
    });
    expect(permanente?.ocorridoEm.paraIso()).toBe('2026-10-07T12:00:01.000Z');
    expect((await interpretar(bounce('Transient')))[0]?.tipo).toBe('falhou');
  });

  it('reclamação, entrega, abertura e clique (eventType do configuration set)', async () => {
    const reclamacao = await interpretar({
      eventType: 'Complaint',
      mail: { ...MAIL, commonHeaders: undefined },
      complaint: {
        complainedRecipients: [{ emailAddress: 'bia@exemplo.invalid' }],
        timestamp: '2026-10-07T12:00:02.000Z',
      },
    });
    expect(reclamacao[0]).toMatchObject({
      idExterno: '<0100-ses>',
      tipo: 'reclamacao',
      motivo: 'spam',
      destinatarios: ['bia@exemplo.invalid'],
    });
    const t = { timestamp: '2026-10-07T12:00:03.000Z' };
    expect(
      (
        await interpretar({ eventType: 'Delivery', mail: MAIL, delivery: { ...t, recipients: [] } })
      )[0]?.tipo,
    ).toBe('entregue');
    expect((await interpretar({ eventType: 'Open', mail: MAIL, open: t }))[0]?.tipo).toBe('aberto');
    expect((await interpretar({ eventType: 'Click', mail: MAIL, click: t }))[0]?.tipo).toBe(
      'clicado',
    );
    expect(
      await interpretar({ eventType: 'Reject', mail: MAIL, reject: { reason: 'Bad content' } }),
    ).toMatchObject([{ tipo: 'falhou', motivo: 'Bad content' }]);
    expect(await interpretar({ eventType: 'Send', mail: MAIL })).toEqual([]);
  });

  it('formato desconhecido ou incompleto vai para a DLQ (erro permanente)', async () => {
    await expect(interpretar({ eventType: 'Novo', mail: MAIL })).rejects.toBeInstanceOf(
      ErroPermanente,
    );
    await expect(interpretar({ eventType: 'Bounce', mail: MAIL })).rejects.toBeInstanceOf(
      ErroPermanente,
    );
    await expect(interpretar({ sem: 'mail' })).rejects.toBeInstanceOf(ErroPermanente);
    const naoJson = notificacao('x');
    await expect(
      webhooks.interpretar(requisicao({ ...naoJson, Message: '{' })),
    ).rejects.toBeInstanceOf(ErroPermanente);
    await expect(
      webhooks.interpretar({ cabecalhos: {}, corpo: new Uint8Array() }),
    ).rejects.toBeInstanceOf(ErroPermanente);
  });

  it('confirma a inscrição só em URL do SNS; cancelamento vai para a DLQ', async () => {
    const http = vi.fn(() => Promise.resolve(resposta('')));
    const { webhooks: comHttp } = criar(http);
    const inscricao = (url: string, Type = 'SubscriptionConfirmation') =>
      requisicao(
        assinar({
          Type,
          MessageId: 'sns-2',
          TopicArn: TOPICO,
          Message: 'confirme',
          Timestamp: '2026-10-07T12:00:00.000Z',
          Token: 't',
          SubscribeURL: url,
        }),
      );
    const valida = 'https://sns.sa-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=t';
    expect(await comHttp.interpretar(inscricao(valida))).toEqual([]);
    expect(http).toHaveBeenCalledWith(valida);
    await expect(comHttp.interpretar(inscricao('https://evil.com/'))).rejects.toBeInstanceOf(
      ErroPermanente,
    );
    await expect(
      comHttp.interpretar(inscricao(valida, 'UnsubscribeConfirmation')),
    ).rejects.toBeInstanceOf(ErroPermanente);
    http.mockResolvedValueOnce(resposta('', 500));
    await expect(comHttp.interpretar(inscricao(valida))).rejects.toBeInstanceOf(ErroTransitorio);
  });
});
