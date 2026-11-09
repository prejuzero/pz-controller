import { randomBytes } from 'node:crypto';

import { carregarAmbiente } from '@pz/config/env';
import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  PerfisEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { FixedClock, gerarUuidV7, Instant, LocalDate, OutboxEmMemoria } from '@pz/kernel';
import { FeedsEmMemoria } from '@pz/relatorios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/** Agenda pessoal (HU50). Prazos e escritório FICTÍCIOS. */
const relogio = new FixedClock(Instant.deIso('2026-11-09T12:00:00Z'));
const ESCRITORIO = gerarUuidV7();
const USUARIO = gerarUuidV7();
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const feeds = new FeedsEmMemoria();
const VENCIMENTO = (() => {
  const r = LocalDate.analisar('2027-03-24');
  if (!r.ok) throw r.erro;
  return r.valor;
})();
let api: NestFastifyApplication;
let token = '';

beforeAll(async () => {
  api = await criarApi({
    termos: termosEmMemoria().dependencias,
    ambiente: carregarAmbiente(esquemaApi, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_REGION: 'us-east-1',
      CHAVE_CIFRAGEM: randomBytes(32).toString('base64'),
      PORTAL_URL: 'https://portal.exemplo.invalid',
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
    },
    janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
    agenda: {
      feeds,
      unidade: new OutboxEmMemoria(),
      trilha: { registrar: () => Promise.resolve() },
      fonte: {
        prazosAbertos: () =>
          Promise.resolve([
            {
              id: 'p1',
              vencimento: VENCIMENTO,
              status: 'a-confirmar' as const,
              nomeDoAto: 'Contestação',
              numeroCnj: '0000001-68.2026.8.26.0100',
              sigiloso: false,
            },
          ]),
      },
    },
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  perfis.atribuir(USUARIO, 'advogado');
  token = randomBytes(32).toString('base64url');
  await sessoes.gravar(token, {
    id: gerarUuidV7(),
    usuarioId: USUARIO,
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

const pedir = (method: 'GET' | 'POST' | 'DELETE', url: string) =>
  api.inject({ method, url, headers: { authorization: `Bearer ${token}` } });

describe('agenda pessoal pela API (HU50)', () => {
  it('assina, a agenda lê o feed sem sessão, revoga e o feed some', async () => {
    expect((await pedir('GET', '/v1/agenda/assinatura')).json()).toEqual({
      ativa: false,
      criadaEm: null,
      ultimoAcesso: null,
    });
    const criada = await pedir('POST', '/v1/agenda/assinatura');
    expect(criada.statusCode).toBe(201);
    expect(criada.headers['cache-control']).toBe('no-store');
    const { url, webcal } = criada.json<{ url: string; webcal: string }>();
    expect(url).toMatch(/^https:\/\/portal\.exemplo\.invalid\/v1\/agenda\/feed\/[\w-]{20,}$/);
    expect(webcal).toBe(url.replace('https://', 'webcal://'));

    const caminho = new URL(url).pathname;
    const feed = await api.inject({ method: 'GET', url: caminho });
    expect(feed.statusCode).toBe(200);
    expect(feed.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(feed.body).toContain(
      'SUMMARY:Prazo: Contestação (a confirmar) · 0000001-68.2026.8.26.0100',
    );
    expect(feed.body).toContain('URL:https://portal.exemplo.invalid/prazos/p1');
    expect((await pedir('GET', '/v1/agenda/assinatura')).json()).toMatchObject({ ativa: true });

    expect((await pedir('DELETE', '/v1/agenda/assinatura')).statusCode).toBe(204);
    expect((await api.inject({ method: 'GET', url: caminho })).statusCode).toBe(404);
    expect((await pedir('DELETE', '/v1/agenda/assinatura')).statusCode).toBe(404);
  });

  it('download do .ics pela sessão; token mal formado é 400; sem sessão, 401', async () => {
    const ics = await pedir('GET', '/v1/agenda/prazos.ics');
    expect(ics.statusCode).toBe(200);
    expect(ics.headers['content-disposition']).toBe('attachment; filename="prazos-prejuzero.ics"');
    expect(ics.body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect((await api.inject({ method: 'GET', url: '/v1/agenda/feed/curto' })).statusCode).toBe(
      400,
    );
    expect((await api.inject({ method: 'GET', url: '/v1/agenda/prazos.ics' })).statusCode).toBe(
      401,
    );
  });
});
