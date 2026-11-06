import { randomBytes } from 'node:crypto';

import { carregarAmbiente } from '@pz/config/env';
import {
  AcessosEmMemoria,
  ClientesOAuthEmMemoria,
  CredenciaisEmMemoria,
  PerfisEmMemoria,
  PublicadorEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { AssinaturasDeWebhookEmMemoria, EntregasDeWebhookEmMemoria } from '@pz/webhooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type {
  AssinaturaDeWebhookCriada,
  AssinaturasDeWebhook,
  EntregaDeWebhook,
  EntregasDeWebhook,
  EventosDeWebhook,
} from '@pz/contracts';

/** Webhooks de saída (HU49). Dados FICTÍCIOS. */
const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const publicador = new PublicadorEmMemoria();
const ESCRITORIO = gerarUuidV7();
let api: NestFastifyApplication;
const unidade = new OutboxEmMemoria();
const entregas = new EntregasDeWebhookEmMemoria();
const auditados: string[] = [];
const trilha = {
  registrar: (_tx: unknown, entrada: { tipo: string }) => {
    auditados.push(entrada.tipo);
    return Promise.resolve();
  },
};
let tokenDoAdvogado = '';

beforeAll(async () => {
  api = await criarApi({
    termos: termosEmMemoria().dependencias,
    ambiente: carregarAmbiente(esquemaApi, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_REGION: 'us-east-1',
      CHAVE_CIFRAGEM: randomBytes(32).toString('base64'),
    }),
    relogio,
    verificadores: [],
    identidade: {
      credenciais: new CredenciaisEmMemoria(),
      sessoes,
      segundoFator: new SegundoFatorEmMemoria(),
      tentativas: new TentativasEmMemoria(),
      acessos: new AcessosEmMemoria(),
      perfis,
      publicador,
      clientesOAuth: new ClientesOAuthEmMemoria(),
    },
    janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
    webhooks: {
      unidade,
      assinaturas: new AssinaturasDeWebhookEmMemoria(),
      entregas,
      trilha,
      outbox: unidade,
    },
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  const usuarioId = gerarUuidV7();
  perfis.atribuir(usuarioId, 'advogado');
  tokenDoAdvogado = randomBytes(32).toString('base64url');
  await sessoes.gravar(tokenDoAdvogado, {
    id: gerarUuidV7(),
    usuarioId,
    tenantId: ESCRITORIO,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: relogio.agora(),
    ultimoUso: relogio.agora(),
  });
});

afterAll(async () => {
  await api.close();
});

const advogado = () => ({ authorization: `Bearer ${tokenDoAdvogado}` });

const pedir = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
  api.inject({
    method,
    url,
    headers: advogado(),
    ...(payload === undefined ? {} : { payload }),
  });

describe('webhooks de saída na API (HU49)', () => {
  it('lista eventos, registra (segredo uma vez), testa, lista entregas e desativa', async () => {
    const eventos = (
      await pedir('GET', '/v1/integracoes/webhooks/eventos')
    ).json<EventosDeWebhook>();
    expect(eventos.itens.map((e) => e.tipo)).toContain('prazo.confirmado');

    const criado = await pedir('POST', '/v1/integracoes/webhooks', {
      url: 'http://localhost:4000/webhooks',
      descricao: 'Receptor local',
      eventos: ['prazo.confirmado'],
    });
    expect(criado.statusCode).toBe(201);
    const { assinatura, segredo } = criado.json<AssinaturaDeWebhookCriada>();
    expect(segredo).toMatch(/^whsec_/);
    const lista = await pedir('GET', '/v1/integracoes/webhooks');
    expect(lista.body).not.toContain(segredo);
    expect(lista.json<AssinaturasDeWebhook>().itens[0]?.id).toBe(assinatura.id);

    const teste = await pedir('POST', `/v1/integracoes/webhooks/${assinatura.id}/testar`);
    expect(teste.statusCode).toBe(202);
    expect(teste.json<EntregaDeWebhook>()).toMatchObject({ tipo: 'webhook.teste' });
    expect(unidade.pendentes().map((e) => e.tipo)).toContain('EntregaWebhookAgendada');
    const doTeste = await pedir(
      'GET',
      `/v1/integracoes/webhooks/entregas?assinaturaId=${assinatura.id}&limite=5`,
    );
    expect(doTeste.json<EntregasDeWebhook>().itens).toHaveLength(1);

    // Só a que falhou é reenviada.
    const id = teste.json<EntregaDeWebhook>().id;
    expect(
      (await pedir('POST', `/v1/integracoes/webhooks/entregas/${id}/reenviar`)).statusCode,
    ).toBe(409);
    expect((await pedir('DELETE', `/v1/integracoes/webhooks/${assinatura.id}`)).statusCode).toBe(
      204,
    );
    expect((await pedir('DELETE', `/v1/integracoes/webhooks/${assinatura.id}`)).statusCode).toBe(
      404,
    );
    expect(
      (await pedir('POST', `/v1/integracoes/webhooks/${assinatura.id}/testar`)).statusCode,
    ).toBe(409);
    expect(auditados).toEqual(['webhooks.assinatura-registrada', 'webhooks.assinatura-desativada']);
  });

  it('reenvia a que falhou; recusa entrada inválida; exige a permissão', async () => {
    const criado = (
      await pedir('POST', '/v1/integracoes/webhooks', {
        url: 'https://erp.exemplo.invalid/w',
        descricao: 'ERP',
        eventos: ['prazo.vencido'],
      })
    ).json<AssinaturaDeWebhookCriada>();
    const teste = (
      await pedir('POST', `/v1/integracoes/webhooks/${criado.assinatura.id}/testar`)
    ).json<EntregaDeWebhook>();
    await entregas.registrarTentativa(null, teste.id as never, {
      situacao: 'falhou',
      status: 500,
      erro: 'HTTP 500',
      agora: relogio.agora(),
      enviou: true,
    });
    expect(
      (await pedir('POST', `/v1/integracoes/webhooks/entregas/${teste.id}/reenviar`)).statusCode,
    ).toBe(204);
    expect((await pedir('GET', '/v1/integracoes/webhooks/entregas')).statusCode).toBe(200);
    expect(
      (await pedir('POST', '/v1/integracoes/webhooks', { url: 'x', descricao: 'x', eventos: [] }))
        .statusCode,
    ).toBe(400);
    expect((await pedir('GET', '/v1/integracoes/webhooks/entregas?limite=0')).statusCode).toBe(400);
    const semLogin = await api.inject({ method: 'GET', url: '/v1/integracoes/webhooks' });
    expect(semLogin.statusCode).toBe(401);
  });
});
