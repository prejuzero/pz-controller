import { randomBytes } from 'node:crypto';

import { Controller, Get } from '@nestjs/common';
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
import { FixedClock, gerarUuidV7, Instant } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { RequerPermissao } from '../http/acesso.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import { credencialBasic } from './integracoes.controller.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ClienteDeIntegracaoCriado, ClientesDeIntegracao } from '@pz/contracts';

/** API pública com Client Credentials (HU49). Dados FICTÍCIOS. */
@Controller('v1/teste-oauth')
class RotasDeTeste {
  @Get('prazos')
  @RequerPermissao('prazos:ler')
  prazos() {
    return { ok: true };
  }

  @Get('processos')
  @RequerPermissao('processos:ler')
  processos() {
    return { ok: true };
  }
}

const relogio = new FixedClock(Instant.deIso('2026-11-06T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const publicador = new PublicadorEmMemoria();
const ESCRITORIO = gerarUuidV7();
let api: NestFastifyApplication;
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
    controllersExtras: [RotasDeTeste],
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

async function registrar(escopos: string[]): Promise<ClienteDeIntegracaoCriado> {
  const r = await api.inject({
    method: 'POST',
    url: '/v1/integracoes/clientes',
    headers: advogado(),
    payload: { nome: 'ERP fictício', escopos },
  });
  expect(r.statusCode).toBe(201);
  expect(r.headers['cache-control']).toBe('no-store');
  return r.json<ClienteDeIntegracaoCriado>();
}

const pedirToken = (payload: string, headers: Record<string, string> = {}) =>
  api.inject({
    method: 'POST',
    url: '/v1/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    payload,
  });

describe('Client Credentials (HU49)', () => {
  it('registra, troca id e segredo por token e usa só os escopos', async () => {
    const { cliente, segredo } = await registrar(['prazos:ler']);
    const token = await pedirToken(
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cliente.id,
        client_secret: segredo,
      }).toString(),
    );
    expect(token.statusCode).toBe(200);
    expect(token.headers['cache-control']).toBe('no-store');
    const corpo = token.json<{ access_token: string; expires_in: number; scope: string }>();
    expect(corpo).toMatchObject({ token_type: 'Bearer', expires_in: 900, scope: 'prazos:ler' });
    const bearer = { authorization: `Bearer ${corpo.access_token}` };
    expect(
      (await api.inject({ method: 'GET', url: '/v1/teste-oauth/prazos', headers: bearer }))
        .statusCode,
    ).toBe(200);
    // O dono tem processos:ler, mas o cliente não recebeu esse escopo.
    expect(
      (await api.inject({ method: 'GET', url: '/v1/teste-oauth/processos', headers: bearer }))
        .statusCode,
    ).toBe(403);
    // Integração não gerencia integrações.
    expect(
      (await api.inject({ method: 'GET', url: '/v1/integracoes/clientes', headers: bearer }))
        .statusCode,
    ).toBe(403);
    expect(publicador.publicados.map((e) => e.tipo)).toContain('ClienteOAuthRegistrado');

    const lista = await api.inject({
      method: 'GET',
      url: '/v1/integracoes/clientes',
      headers: advogado(),
    });
    expect(lista.body).not.toContain(segredo);
    expect(lista.json<ClientesDeIntegracao>().itens[0]).toMatchObject({
      id: cliente.id,
      ultimoUso: '2026-11-06T12:00:00.000Z',
      revogadoEm: null,
    });

    const revogado = await api.inject({
      method: 'DELETE',
      url: `/v1/integracoes/clientes/${cliente.id}`,
      headers: advogado(),
    });
    expect(revogado.statusCode).toBe(204);
    expect(
      (await api.inject({ method: 'GET', url: '/v1/teste-oauth/prazos', headers: bearer }))
        .statusCode,
    ).toBe(401);
    const deNovo = await api.inject({
      method: 'DELETE',
      url: `/v1/integracoes/clientes/${cliente.id}`,
      headers: advogado(),
    });
    expect(deNovo.statusCode).toBe(404);
  });

  it('aceita Basic e JSON; recusa segredo errado, escopo alheio e pedido mal formado', async () => {
    const { cliente, segredo } = await registrar(['publicacoes:ler', 'prazos:ler']);
    const basic = `Basic ${Buffer.from(`${cliente.id}:${segredo}`).toString('base64')}`;
    const porBasic = await pedirToken('grant_type=client_credentials&scope=prazos:ler', {
      authorization: basic,
    });
    expect(porBasic.statusCode).toBe(200);
    expect(porBasic.json<{ scope: string }>().scope).toBe('prazos:ler');

    const json = await api.inject({
      method: 'POST',
      url: '/v1/oauth/token',
      payload: { grant_type: 'client_credentials', client_id: cliente.id, client_secret: segredo },
    });
    expect(json.statusCode).toBe(200);

    const errado = await pedirToken('grant_type=client_credentials', {
      authorization: `Basic ${Buffer.from(`${cliente.id}:${'x'.repeat(40)}`).toString('base64')}`,
    });
    expect(errado.statusCode).toBe(401);
    expect(errado.headers['www-authenticate']).toBe('Basic realm="prejuzero"');
    expect(errado.json<{ codigo: string }>().codigo).toBe('invalid_client');

    const codigo = async (payload: string, headers: Record<string, string> = {}) => {
      const r = await pedirToken(payload, headers);
      return [r.statusCode, r.json<{ codigo: string }>().codigo];
    };
    expect(
      await codigo('grant_type=client_credentials&scope=processos:ler', { authorization: basic }),
    ).toEqual([400, 'invalid_scope']);
    expect(await codigo('grant_type=password', { authorization: basic })).toEqual([
      400,
      'unsupported_grant_type',
    ]);
    expect(await codigo('grant_type=client_credentials')).toEqual([401, 'invalid_client']);
    expect(
      await codigo(`grant_type=client_credentials&client_id=${cliente.id}`, {
        authorization: basic,
      }),
    ).toEqual([400, 'invalid_request']);
  });

  it('não registra integração com escopo de escrita; lista só escopos de leitura', async () => {
    const r = await api.inject({
      method: 'POST',
      url: '/v1/integracoes/clientes',
      headers: advogado(),
      payload: { nome: 'x', escopos: ['prazos:confirmar'] },
    });
    expect(r.statusCode).toBe(400);
    const escopos = await api.inject({
      method: 'GET',
      url: '/v1/integracoes/escopos',
      headers: advogado(),
    });
    const itens = escopos.json<{ itens: { escopo: string }[] }>().itens.map((e) => e.escopo);
    expect(itens).toContain('prazos:ler');
    expect(itens).not.toContain('prazos:confirmar');
  });

  it('formulário só no endpoint de token', async () => {
    const r = await api.inject({
      method: 'POST',
      url: '/v1/auth/entrar',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'email=a@exemplo.invalid&senha=qualquer',
    });
    expect(r.statusCode).toBe(415);
  });
});

describe('credencial Basic', () => {
  it('decodifica id:segredo e ignora o que não é Basic', () => {
    const b = (texto: string) => `Basic ${Buffer.from(texto).toString('base64')}`;
    expect(credencialBasic(b('id:se:gredo'))).toEqual({ id: 'id', segredo: 'se:gredo' });
    expect(credencialBasic(b('semdoispontos'))).toBeUndefined();
    expect(credencialBasic('Bearer x')).toBeUndefined();
    expect(credencialBasic(undefined)).toBeUndefined();
  });
});
