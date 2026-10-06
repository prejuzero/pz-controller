import { Controller, Get, Post } from '@nestjs/common';
import { carregarAmbiente } from '@pz/config/env';
import { SessaoAtual } from '@pz/contracts';
import { tenantAtual } from '@pz/db';
import { CredenciaisEmMemoria, HasherArgon2, SessoesEmMemoria } from '@pz/identidade';
import { gerarUuidV7 } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { PermiteSessaoParcial } from '../http/acesso.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Email } from '@pz/identidade';

// Dados fictícios de teste.
const USUARIO = gerarUuidV7();
const TENANT = gerarUuidV7();
const SENHA = 'senha de teste bem longa';

@Controller('v1/teste-auth')
class RotasDeTeste {
  @Get('tenant')
  @PermiteSessaoParcial()
  tenant(): { tenant: string | undefined } {
    return { tenant: tenantAtual() };
  }

  @Post('completa')
  completa(): { ok: true } {
    return { ok: true };
  }
}

const sessoes = new SessoesEmMemoria();
let api: NestFastifyApplication;

beforeAll(async () => {
  const credenciais = new CredenciaisEmMemoria();
  credenciais.cadastrar('ana@exemplo.invalid' as Email, {
    usuarioId: USUARIO,
    tenantId: TENANT,
    senhaHash: await new HasherArgon2().gerar(SENHA),
  });
  api = await criarApi({
    ambiente: carregarAmbiente(esquemaApi, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_REGION: 'us-east-1',
    }),
    verificadores: [],
    controllersExtras: [RotasDeTeste],
    identidade: { credenciais, sessoes },
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await api.close();
});

async function entrar(email = 'ana@exemplo.invalid', senha = SENHA) {
  const resposta = await api.inject({
    method: 'POST',
    url: '/v1/auth/entrar',
    payload: { email, senha },
  });
  const cookies = ([] as string[]).concat(resposta.headers['set-cookie'] ?? []);
  const valor = (nome: string) =>
    cookies
      .find((c) => c.startsWith(`${nome}=`))
      ?.split(';')[0]
      ?.split('=')[1] ?? '';
  return { resposta, cookies, sessao: valor('__Host-pz_sessao'), csrf: valor('__Host-pz_csrf') };
}

describe('login (HU06)', () => {
  it('senha certa: 200 conforme o contrato, cookies __Host- seguros e sessão aguardando 2FA', async () => {
    const { resposta, cookies, sessao, csrf } = await entrar('  ANA@exemplo.invalid ');
    expect(resposta.statusCode).toBe(200);
    expect(SessaoAtual.esquema.parse(resposta.json())).toEqual({
      usuarioId: USUARIO,
      tenantId: TENANT,
      nivel: 'senha',
    });
    expect(resposta.headers['cache-control']).toBe('no-store');
    expect(cookies.find((c) => c.startsWith('__Host-pz_sessao='))).toMatch(
      /; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800$/,
    );
    expect(cookies.find((c) => c.startsWith('__Host-pz_csrf='))).not.toContain('HttpOnly');
    expect(sessao).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(csrf).not.toBe(sessao);
  });

  it('e-mail inexistente, senha errada ou corpo inválido: mesma resposta 401 genérica / 400', async () => {
    const [inexistente, errada] = await Promise.all([
      entrar('ninguem@exemplo.invalid'),
      entrar('ana@exemplo.invalid', 'senha errada longa'),
    ]);
    for (const { resposta, cookies } of [inexistente, errada]) {
      expect(resposta.statusCode).toBe(401);
      expect(resposta.headers['content-type']).toContain('application/problem+json');
      expect(cookies).toEqual([]);
    }
    const semId = (corpo: Record<string, unknown>) => ({ ...corpo, requestId: undefined });
    expect(semId(inexistente.resposta.json())).toEqual(semId(errada.resposta.json()));
    const semSenha = await api.inject({
      method: 'POST',
      url: '/v1/auth/entrar',
      payload: { email: 'a@b.c' },
    });
    expect(semSenha.statusCode).toBe(400);
  });
});

describe('guarda: cookie com CSRF, Bearer e nível da sessão', () => {
  it('sessão sem 2FA só acessa rotas parciais; o handler roda no tenant da sessão', async () => {
    const { sessao } = await entrar();
    const cookie = `__Host-pz_sessao=${sessao}`;
    const eu = await api.inject({ method: 'GET', url: '/v1/auth/eu', headers: { cookie } });
    expect(eu.json()).toMatchObject({ nivel: 'senha' });
    const tenant = await api.inject({
      method: 'GET',
      url: '/v1/teste-auth/tenant',
      headers: { cookie },
    });
    expect(tenant.json()).toEqual({ tenant: TENANT });
    const completa = await api.inject({
      method: 'POST',
      url: '/v1/teste-auth/completa',
      headers: { authorization: `Bearer ${sessao}` },
    });
    expect(completa.statusCode).toBe(401);
  });

  it('sem token, token inválido ou expirado: 401', async () => {
    expect((await api.inject({ method: 'GET', url: '/v1/auth/eu' })).statusCode).toBe(401);
    const falso = 'x'.repeat(43);
    expect(
      (
        await api.inject({
          method: 'GET',
          url: '/v1/auth/eu',
          headers: { cookie: `__Host-pz_sessao=${falso}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await api.inject({
          method: 'GET',
          url: '/v1/auth/eu',
          headers: { authorization: `Bearer ${falso}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('modo cookie: métodos que alteram estado exigem o CSRF; Bearer não usa CSRF', async () => {
    const { sessao, csrf } = await entrar();
    const cookie = `__Host-pz_sessao=${sessao}; __Host-pz_csrf=${csrf}`;
    const semCsrf = await api.inject({ method: 'POST', url: '/v1/auth/sair', headers: { cookie } });
    expect(semCsrf.statusCode).toBe(403);
    const csrfErrado = await api.inject({
      method: 'POST',
      url: '/v1/auth/sair',
      headers: { cookie, 'x-csrf-token': 'outro' },
    });
    expect(csrfErrado.statusCode).toBe(403);

    const outra = await entrar();
    const bearer = await api.inject({
      method: 'POST',
      url: '/v1/auth/sair',
      headers: { authorization: `Bearer ${outra.sessao}` },
    });
    expect(bearer.statusCode).toBe(204);
  });

  it('sair encerra a sessão e apaga os cookies', async () => {
    const { sessao, csrf } = await entrar();
    const cookie = `__Host-pz_sessao=${sessao}; __Host-pz_csrf=${csrf}`;
    const saida = await api.inject({
      method: 'POST',
      url: '/v1/auth/sair',
      headers: { cookie, 'x-csrf-token': csrf },
    });
    expect(saida.statusCode).toBe(204);
    expect(
      ([] as string[])
        .concat(saida.headers['set-cookie'] ?? [])
        .every((c) => c.includes('Max-Age=0')),
    ).toBe(true);
    expect(
      (await api.inject({ method: 'GET', url: '/v1/auth/eu', headers: { cookie } })).statusCode,
    ).toBe(401);
  });
});
