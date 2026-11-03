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

import { JanelaEmMemoria, LimiteDoTenant } from './limite.js';

import type { AmbienteApi } from '../ambiente.js';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

let api: NestFastifyApplication;
let restrita: NestFastifyApplication;

const montar = async (extra: Record<string, string> = {}) => {
  const montada = await criarApi({
    termos: termosEmMemoria().dependencias,
    ambiente: carregarAmbiente(esquemaApi, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_REGION: 'us-east-1',
      CHAVE_CIFRAGEM: randomBytes(32).toString('base64'),
      ...extra,
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
  await montada.init();
  await montada.getHttpAdapter().getInstance().ready();
  return montada;
};

beforeAll(async () => {
  api = await montar();
  restrita = await montar({
    LIMITE_POR_IP_POR_MINUTO: '3',
    CORS_ORIGENS: 'https://portal.exemplo.invalid, https://app.exemplo.invalid',
  });
});

afterAll(async () => {
  await api.close();
  await restrita.close();
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

describe('hardening da API (HU37)', () => {
  it('limite global por IP; as sondas de saúde não contam', async () => {
    const termos = (ip: string) =>
      restrita.inject({ method: 'GET', url: '/v1/termos/vigentes', remoteAddress: ip });
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await restrita.inject({
            method: 'GET',
            url: '/health/live',
            remoteAddress: '198.51.100.9',
          })
        ).statusCode,
      ).toBe(200);
    }
    for (let i = 0; i < 3; i++) expect((await termos('198.51.100.9')).statusCode).not.toBe(429);
    const excedida = await termos('198.51.100.9');
    expect(excedida.statusCode).toBe(429);
    expect(excedida.headers['retry-after']).toBe('60');
    expect((await termos('198.51.100.10')).statusCode).not.toBe(429);
  });

  it('cabeçalhos de segurança e no-store em toda resposta', async () => {
    const r = await api.inject({ method: 'GET', url: '/health/live' });
    expect(r.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'cache-control': 'no-store',
    });
    // Fora de produção, sem HSTS (o ambiente local é http).
    expect(r.headers['strict-transport-security']).toBeUndefined();
  });

  it('CORS: sem lista, nenhuma origem cruzada; com lista, só as configuradas', async () => {
    const preflight = (app: NestFastifyApplication, origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/v1/termos/vigentes',
        headers: { origin, 'access-control-request-method': 'GET' },
      });
    expect(
      (await preflight(api, 'https://portal.exemplo.invalid')).headers[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
    const aceita = await preflight(restrita, 'https://portal.exemplo.invalid');
    expect(aceita.headers['access-control-allow-origin']).toBe('https://portal.exemplo.invalid');
    expect(aceita.headers['access-control-allow-credentials']).toBe('true');
    expect(
      (await preflight(restrita, 'https://malicioso.exemplo.invalid')).headers[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
  });

  it('limite por escritório depois da autenticação', async () => {
    const limite = new LimiteDoTenant(new JanelaEmMemoria(), {
      LIMITE_POR_TENANT_POR_MINUTO: 2,
    } as AmbienteApi);
    const cabecalhos: Record<string, string> = {};
    const contexto = (tenantId?: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            url: '/v1/prazos',
            routeOptions: { url: '/v1/prazos' },
            ...(tenantId === undefined ? {} : { autenticacao: { sessao: { tenantId } } }),
          }),
          getResponse: () => ({
            header: (k: string, v: string) => {
              cabecalhos[k] = v;
            },
          }),
        }),
      }) as unknown as ExecutionContext;
    const proximo = { handle: () => 'ok' } as unknown as CallHandler;
    await limite.intercept(contexto('a'), proximo);
    await limite.intercept(contexto('a'), proximo);
    await expect(limite.intercept(contexto('a'), proximo)).rejects.toMatchObject({ status: 429 });
    expect(cabecalhos['retry-after']).toBe('60');
    await limite.intercept(contexto('b'), proximo);
    for (let i = 0; i < 5; i++) await limite.intercept(contexto(), proximo);
  });

  it('limite por usuário na rota marcada (envio manual, HU32)', async () => {
    const refletor = { get: () => ({ maximo: 1, janelaMs: 3_600_000 }) } as unknown as Reflector;
    const limite = new LimiteDoTenant(
      new JanelaEmMemoria(),
      { LIMITE_POR_TENANT_POR_MINUTO: 100 } as AmbienteApi,
      refletor,
    );
    const contexto = (usuarioId: string) =>
      ({
        getHandler: () => undefined,
        switchToHttp: () => ({
          getRequest: () => ({
            url: '/v1/envios',
            routeOptions: { url: '/v1/envios' },
            autenticacao: { sessao: { tenantId: 't', usuarioId } },
          }),
          getResponse: () => ({ header: () => undefined }),
        }),
      }) as unknown as ExecutionContext;
    const proximo = { handle: () => 'ok' } as unknown as CallHandler;
    await limite.intercept(contexto('u1'), proximo);
    await expect(limite.intercept(contexto('u1'), proximo)).rejects.toMatchObject({ status: 429 });
    await limite.intercept(contexto('u2'), proximo);
    // Sem a rota no Fastify, a chave usa a URL.
    const semRota = {
      getHandler: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({
          url: '/v1/envios',
          routeOptions: {},
          autenticacao: { sessao: { tenantId: 't', usuarioId: 'u3' } },
        }),
        getResponse: () => ({ header: () => undefined }),
      }),
    } as unknown as ExecutionContext;
    await limite.intercept(semRota, proximo);
  });
});
