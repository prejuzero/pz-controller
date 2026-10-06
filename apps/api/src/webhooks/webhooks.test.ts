import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { carregarAmbiente } from '@pz/config/env';
import { WebhookAceito } from '@pz/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { WebhookParaGravar } from '@pz/db';
import type { ReceptorWebhook, RequisicaoWebhook } from '@pz/integracoes';

// Segredo gerado a cada execução (nada fixo no código).
const SEGREDO = randomBytes(32);
const assinar = (corpo: string) => createHmac('sha256', SEGREDO).update(corpo).digest('hex');

/** Receptor de teste: HMAC-SHA256 sobre os bytes brutos, como os provedores reais. */
const receptor: ReceptorWebhook = {
  verificarAssinatura: (requisicao: RequisicaoWebhook) => {
    const esperada = Buffer.from(
      createHmac('sha256', SEGREDO).update(requisicao.corpo).digest('hex'),
    );
    const recebida = Buffer.from(requisicao.cabecalhos['x-assinatura'] ?? '');
    return Promise.resolve(
      recebida.length === esperada.length && timingSafeEqual(recebida, esperada),
    );
  },
  idExterno: (requisicao) => requisicao.cabecalhos['x-id-evento'] ?? '',
};

const gravados: WebhookParaGravar[] = [];
let api: NestFastifyApplication;

beforeAll(async () => {
  api = await criarApi({
    ambiente: carregarAmbiente(esquemaApi, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_REGION: 'us-east-1',
    }),
    verificadores: [],
    caixaDeWebhooks: {
      gravar: (webhook) => {
        const novo = !gravados.some(
          (g) => g.adaptador === webhook.adaptador && g.idExterno === webhook.idExterno,
        );
        if (novo) gravados.push(webhook);
        return Promise.resolve(novo);
      },
    },
    receptoresDeWebhook: new Map([['teste', receptor]]),
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await api.close();
});

function enviar(corpo: string, cabecalhos: Record<string, string>, adaptador = 'teste') {
  return api.inject({
    method: 'POST',
    url: `/v1/webhooks/${adaptador}`,
    headers: { 'content-type': 'application/json', ...cabecalhos },
    payload: corpo,
  });
}

describe('gateway de webhooks (HU09)', () => {
  // Espaços e ordem preservados: a assinatura vale para os bytes exatos, não para o JSON.
  const corpo = '{ "tipo": "entregue",  "id": 1 }';

  it('assinatura válida: grava os bytes exatos e responde 202 conforme o contrato', async () => {
    const resposta = await enviar(corpo, {
      'x-assinatura': assinar(corpo),
      'x-id-evento': 'ev-1',
      authorization: 'Bearer nao-gravar',
    });
    expect(resposta.statusCode).toBe(202);
    expect(WebhookAceito.esquema.parse(resposta.json())).toEqual({ duplicado: false });
    expect(gravados).toHaveLength(1);
    expect(new TextDecoder().decode(gravados[0]?.corpo)).toBe(corpo);
    expect(gravados[0]?.cabecalhos).not.toHaveProperty('authorization');
  });

  it('o mesmo webhook repetido é aceito sem gravar de novo', async () => {
    const resposta = await enviar(corpo, { 'x-assinatura': assinar(corpo), 'x-id-evento': 'ev-1' });
    expect(resposta.json()).toEqual({ duplicado: true });
    expect(gravados).toHaveLength(1);
  });

  it('corpo em texto puro também é verificado sobre os bytes', async () => {
    const texto = 'Type=Notification&Id=2';
    const resposta = await enviar(texto, {
      'content-type': 'text/plain',
      'x-assinatura': assinar(texto),
      'x-id-evento': 'ev-2',
    });
    expect(resposta.statusCode).toBe(202);
  });

  it('assinatura inválida ou ausente: 401 em problem+json, nada gravado', async () => {
    const antes = gravados.length;
    for (const cabecalhos of [{ 'x-assinatura': assinar('outro corpo') }, {}]) {
      const resposta = await enviar(corpo, { ...cabecalhos, 'x-id-evento': 'ev-3' });
      expect(resposta.statusCode).toBe(401);
      expect(resposta.headers['content-type']).toContain('application/problem+json');
    }
    expect(gravados).toHaveLength(antes);
  });

  it('adaptador sem receptor de webhook: 404', async () => {
    expect(
      (await enviar(corpo, { 'x-assinatura': assinar(corpo) }, 'desconhecido')).statusCode,
    ).toBe(404);
  });
});
