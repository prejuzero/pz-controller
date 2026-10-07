import { randomBytes } from 'node:crypto';

import { carregarAmbiente } from '@pz/config/env';
import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import { JanelaEmMemoria } from './limite.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';

let api: NestFastifyApplication;

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
    verificadores: [],
    identidade: {
      credenciais: new CredenciaisEmMemoria(),
      sessoes: new SessoesEmMemoria(),
      segundoFator: new SegundoFatorEmMemoria(),
      tentativas: new TentativasEmMemoria(),
      acessos: new AcessosEmMemoria(),
    },
    janelaDeRequisicoes: new JanelaEmMemoria(),
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await api.close();
});

const entrar = (ip: string) =>
  api.inject({
    method: 'POST',
    url: '/v1/auth/entrar',
    remoteAddress: ip,
    payload: { email: 'ninguem@exemplo.invalid', senha: 'qualquer senha longa' },
  });

describe('limite por IP (HU06)', () => {
  it('a 11ª tentativa de login do mesmo IP no minuto recebe 429 com Retry-After; outro IP segue', async () => {
    for (let i = 0; i < 10; i++) expect((await entrar('198.51.100.1')).statusCode).toBe(401);
    const excedida = await entrar('198.51.100.1');
    expect(excedida.statusCode).toBe(429);
    expect(excedida.headers['retry-after']).toBe('60');
    expect(excedida.headers['content-type']).toContain('application/problem+json');
    expect((await entrar('198.51.100.2')).statusCode).toBe(401);
  });

  it('rotas sem @LimitarPorIp não são limitadas', async () => {
    for (let i = 0; i < 15; i++) {
      expect(
        (await api.inject({ method: 'GET', url: '/health/live', remoteAddress: '198.51.100.3' }))
          .statusCode,
      ).toBe(200);
    }
  });
});
