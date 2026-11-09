import { randomBytes } from 'node:crypto';

import { Controller, Get } from '@nestjs/common';
import { carregarAmbiente } from '@pz/config/env';
import { CABECALHO_CSRF, COOKIE_CSRF, COOKIE_SESSAO } from '@pz/contracts';
import {
  AcessosEmMemoria,
  ClientesOAuthEmMemoria,
  RegistrosDinamicosEmMemoria,
  CodigosEmMemoria,
  desafioPkce,
  DispositivosEmMemoria,
  RenovacoesEmMemoria,
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
      registrosOAuth: new RegistrosDinamicosEmMemoria(),
      codigosOAuth: new CodigosEmMemoria(),
      dispositivos: new DispositivosEmMemoria(),
      renovacoes: new RenovacoesEmMemoria(),
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

describe('Authorization Code + PKCE (HU49)', () => {
  const VERIFICADOR = 'v'.repeat(43);
  const RETORNO = 'http://localhost:8765/retorno';
  const portal = () => ({
    cookie: `${COOKIE_SESSAO}=${tokenDoAdvogado}; ${COOKIE_CSRF}=csrf-ficticio`,
    [CABECALHO_CSRF]: 'csrf-ficticio',
  });

  it('registra o app, consente pelo portal, troca o código, renova e revoga', async () => {
    const criado = await api.inject({
      method: 'POST',
      url: '/v1/integracoes/apps',
      headers: advogado(),
      payload: { nome: 'Assistente fictício', escopos: ['prazos:ler'], redirectUris: [RETORNO] },
    });
    expect(criado.statusCode).toBe(201);
    const app = criado.json<{ cliente: { id: string; tipo: string } }>().cliente;
    expect(app.tipo).toBe('publico');
    const pedido = {
      response_type: 'code',
      client_id: app.id,
      redirect_uri: RETORNO,
      scope: 'prazos:ler',
      state: 'estado-ficticio',
      code_challenge: desafioPkce(VERIFICADOR),
      code_challenge_method: 'S256',
    };
    const consulta = new URLSearchParams(pedido).toString();
    const descricao = await api.inject({
      method: 'GET',
      url: `/v1/oauth/autorizacao?${consulta}`,
      headers: portal(),
    });
    expect(descricao.statusCode).toBe(200);
    expect(descricao.json<{ cliente: { nome: string } }>().cliente.nome).toBe(
      'Assistente fictício',
    );
    // Token de app não consente por outro app.
    const porBearer = await api.inject({
      method: 'GET',
      url: `/v1/oauth/autorizacao?${consulta}`,
      headers: advogado(),
    });
    expect(porBearer.statusCode).toBe(403);

    const autorizado = await api.inject({
      method: 'POST',
      url: '/v1/oauth/autorizacao',
      headers: portal(),
      payload: pedido,
    });
    expect(autorizado.statusCode).toBe(200);
    const destino = new URL(autorizado.json<{ redirecionarPara: string }>().redirecionarPara);
    expect(destino.searchParams.get('state')).toBe('estado-ficticio');
    const codigo = destino.searchParams.get('code') ?? '';

    const token = await pedirToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: app.id,
        code: codigo,
        redirect_uri: RETORNO,
        code_verifier: VERIFICADOR,
      }).toString(),
    );
    expect(token.statusCode).toBe(200);
    const corpo = token.json<{ access_token: string; refresh_token: string; scope: string }>();
    expect(corpo.scope).toBe('prazos:ler');
    const bearer = { authorization: `Bearer ${corpo.access_token}` };
    expect(
      (await api.inject({ method: 'GET', url: '/v1/teste-oauth/prazos', headers: bearer }))
        .statusCode,
    ).toBe(200);
    expect(
      (await api.inject({ method: 'GET', url: '/v1/teste-oauth/processos', headers: bearer }))
        .statusCode,
    ).toBe(403);

    const renovado = await pedirToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: app.id,
        refresh_token: corpo.refresh_token,
      }).toString(),
    );
    expect(renovado.statusCode).toBe(200);
    const reuso = await pedirToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: app.id,
        refresh_token: corpo.refresh_token,
      }).toString(),
    );
    expect(reuso.json<{ codigo: string }>().codigo).toBe('invalid_grant');

    const codigoErro = async (payload: Record<string, string>, headers = {}) => {
      const r = await pedirToken(new URLSearchParams(payload).toString(), headers);
      return [r.statusCode, r.json<{ codigo: string }>().codigo];
    };
    expect(await codigoErro({ grant_type: 'authorization_code', client_id: app.id })).toEqual([
      400,
      'invalid_request',
    ]);
    expect(await codigoErro({ grant_type: 'refresh_token', client_id: app.id })).toEqual([
      400,
      'invalid_request',
    ]);
    expect(
      await codigoErro(
        { grant_type: 'refresh_token', refresh_token: 'r'.repeat(30) },
        { authorization: 'Basic eDp5' },
      ),
    ).toEqual([401, 'invalid_client']);
    expect(
      await codigoErro({
        grant_type: 'authorization_code',
        client_id: app.id,
        code: 'c'.repeat(30),
        redirect_uri: RETORNO,
        code_verifier: VERIFICADOR,
      }),
    ).toEqual([401, 'invalid_grant']);
    for (const [faltando, campos] of [
      ['redirect_uri', { code: 'c'.repeat(30), code_verifier: VERIFICADOR }],
      ['code_verifier', { code: 'c'.repeat(30), redirect_uri: RETORNO }],
    ] as const) {
      const r = await pedirToken(
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: app.id,
          ...campos,
        }).toString(),
      );
      expect([r.statusCode, r.json<{ codigo: string }>().codigo, faltando]).toEqual([
        400,
        'invalid_request',
        faltando,
      ]);
    }
    // grant conhecido com campo inválido: pedido inválido, não grant desconhecido.
    expect(await codigoErro({ grant_type: 'client_credentials', client_id: 'nao-e-uuid' })).toEqual(
      [400, 'invalid_request'],
    );

    // Pedido sem scope e sem state; app desconhecido; endereço de retorno inválido no registro.
    const semOpcionais = new URLSearchParams({
      response_type: 'code',
      client_id: app.id,
      redirect_uri: RETORNO,
      code_challenge: desafioPkce(VERIFICADOR),
      code_challenge_method: 'S256',
    }).toString();
    expect(
      (
        await api.inject({
          method: 'GET',
          url: `/v1/oauth/autorizacao?${semOpcionais}`,
          headers: portal(),
        })
      ).statusCode,
    ).toBe(200);
    const desconhecido = await api.inject({
      method: 'POST',
      url: '/v1/oauth/autorizacao',
      headers: portal(),
      payload: { ...pedido, client_id: gerarUuidV7() },
    });
    expect(desconhecido.json<{ codigo: string }>().codigo).toBe('invalid_client');
    const getDesconhecido = await api.inject({
      method: 'GET',
      url: `/v1/oauth/autorizacao?${new URLSearchParams({ ...pedido, client_id: gerarUuidV7() }).toString()}`,
      headers: portal(),
    });
    expect(getDesconhecido.statusCode).toBe(400);
    const retornoInvalido = await api.inject({
      method: 'POST',
      url: '/v1/integracoes/apps',
      headers: advogado(),
      payload: { nome: 'x', escopos: ['prazos:ler'], redirectUris: ['http://app.exemplo.invalid'] },
    });
    expect(retornoInvalido.statusCode).toBe(400);
  });
});

describe('registro dinâmico e descoberta para assistentes (HU60)', () => {
  const VERIFICADOR = 'w'.repeat(43);
  const RETORNO = 'https://assistente.exemplo.invalid/callback';
  const portal = () => ({
    cookie: `${COOKIE_SESSAO}=${tokenDoAdvogado}; ${COOKIE_CSRF}=csrf-ficticio`,
    [CABECALHO_CSRF]: 'csrf-ficticio',
  });

  it('metadados RFC 8414 apontam para o portal; só leitura e PKCE', async () => {
    const r = await api.inject({ method: 'GET', url: '/v1/oauth/metadados' });
    expect(r.json()).toMatchObject({
      authorization_endpoint: 'http://localhost:3001/oauth/autorizar',
      token_endpoint: 'http://localhost:3001/v1/oauth/token',
      registration_endpoint: 'http://localhost:3001/v1/oauth/registro',
      code_challenge_methods_supported: ['S256'],
    });
    expect(r.json<{ scopes_supported: string[] }>().scopes_supported).toContain('prazos:ler');
  });

  it('o assistente se registra, o advogado autoriza e o token renova pelo id do registro', async () => {
    const registro = await api.inject({
      method: 'POST',
      url: '/v1/oauth/registro',
      payload: {
        client_name: 'Assistente MCP fictício',
        redirect_uris: [RETORNO],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
    });
    expect(registro.statusCode).toBe(201);
    const { client_id: clientId } = registro.json<{ client_id: string }>();
    const pedido = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: RETORNO,
      scope: 'prazos:ler',
      code_challenge: desafioPkce(VERIFICADOR),
      code_challenge_method: 'S256',
      // RFC 8707: o recurso pedido pelo assistente (o servidor MCP) é aceito e ignorado.
      resource: 'https://mcp.exemplo.invalid/mcp',
    };
    const descricao = await api.inject({
      method: 'GET',
      url: `/v1/oauth/autorizacao?${new URLSearchParams(pedido).toString()}`,
      headers: portal(),
    });
    expect(descricao.json()).toMatchObject({
      cliente: { id: clientId, nome: 'Assistente MCP fictício' },
      registroAutomatico: true,
    });
    const autorizado = await api.inject({
      method: 'POST',
      url: '/v1/oauth/autorizacao',
      headers: portal(),
      payload: pedido,
    });
    const codigo =
      new URL(autorizado.json<{ redirecionarPara: string }>().redirecionarPara).searchParams.get(
        'code',
      ) ?? '';
    const token = await pedirToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: codigo,
        redirect_uri: RETORNO,
        code_verifier: VERIFICADOR,
        resource: 'https://mcp.exemplo.invalid/mcp',
      }).toString(),
    );
    expect(token.statusCode).toBe(200);
    const corpo = token.json<{ access_token: string; refresh_token: string }>();
    expect(
      (
        await api.inject({
          method: 'GET',
          url: '/v1/teste-oauth/prazos',
          headers: { authorization: `Bearer ${corpo.access_token}` },
        })
      ).statusCode,
    ).toBe(200);
    const renovado = await pedirToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: corpo.refresh_token,
      }).toString(),
    );
    expect(renovado.statusCode).toBe(200);
  });

  it('recusa registro fora do padrão com o erro do RFC 7591', async () => {
    const r = await api.inject({
      method: 'POST',
      url: '/v1/oauth/registro',
      payload: { redirect_uris: ['http://assistente.exemplo.invalid/cb'] },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error: 'invalid_redirect_uri' });
    const semRetorno = await api.inject({
      method: 'POST',
      url: '/v1/oauth/registro',
      payload: { client_name: 'x' },
    });
    expect(semRetorno.json()).toMatchObject({ error: 'invalid_client_metadata' });
  });
});
