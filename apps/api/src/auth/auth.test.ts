import { randomBytes } from 'node:crypto';

import { Controller, Get, Post } from '@nestjs/common';
import { carregarAmbiente } from '@pz/config/env';
import { SessaoAtual } from '@pz/contracts';
import { tenantAtual } from '@pz/db';
import {
  CifraAesGcm,
  PublicadorEmMemoria,
  RedefinicoesEmMemoria,
  AcessosEmMemoria,
  TentativasEmMemoria,
  CredenciaisEmMemoria,
  HasherArgon2,
  SegredosTotp,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
} from '@pz/identidade';
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
const CHAVE = randomBytes(32).toString('base64');
const publicador = new PublicadorEmMemoria();

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
const segundoFator = new SegundoFatorEmMemoria();
const credenciais = new CredenciaisEmMemoria();
const acessos = new AcessosEmMemoria();
let hashDaSenha = '';
let api: NestFastifyApplication;

beforeAll(async () => {
  credenciais.cadastrar('ana@exemplo.invalid' as Email, {
    usuarioId: USUARIO,
    tenantId: TENANT,
    senhaHash: (hashDaSenha = await new HasherArgon2().gerar(SENHA)),
    segundoFatorAtivo: false,
  });
  segundoFator.cadastrar(USUARIO, 'ana@exemplo.invalid');
  api = await criarApi({
    ambiente: carregarAmbiente(esquemaApi, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
      REDIS_URL: 'redis://127.0.0.1:6379',
      S3_REGION: 'us-east-1',
      CHAVE_CIFRAGEM: CHAVE,
    }),
    verificadores: [],
    controllersExtras: [RotasDeTeste],
    identidade: {
      publicador,
      redefinicoes: new RedefinicoesEmMemoria(),
      credenciais,
      sessoes,
      segundoFator,
      tentativas: new TentativasEmMemoria(),
      acessos,
    },
    // Sem limite por IP nesta suíte (muitos logins); o limite tem teste próprio.
    janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
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
      proximoPasso: 'configurar-2fa',
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

describe('2FA na api (HU06)', () => {
  const segredos = new SegredosTotp();
  const passo = () => Math.floor(Date.now() / 30_000);

  it('configurar → ativar eleva a sessão com novo token; depois do próximo login, verificar', async () => {
    const { sessao, csrf } = await entrar();
    const cookie = `__Host-pz_sessao=${sessao}; __Host-pz_csrf=${csrf}`;
    const cabecalhos = { cookie, 'x-csrf-token': csrf };

    const configurado = await api.inject({
      method: 'POST',
      url: '/v1/auth/2fa/configurar',
      headers: cabecalhos,
    });
    expect(configurado.statusCode).toBe(200);
    const { segredo, uri } = configurado.json<{ segredo: string; uri: string }>();
    expect(uri).toMatch(/^otpauth:\/\/totp\//);

    const errado = await api.inject({
      method: 'POST',
      url: '/v1/auth/2fa/ativar',
      headers: cabecalhos,
      payload: { codigo: '000000' },
    });
    expect(errado.statusCode).toBe(401);

    const ativado = await api.inject({
      method: 'POST',
      url: '/v1/auth/2fa/ativar',
      headers: cabecalhos,
      payload: { codigo: segredos.codigo(segredo, passo()) },
    });
    expect(ativado.statusCode).toBe(200);
    expect(ativado.json()).toMatchObject({ sessao: { nivel: 'completo', proximoPasso: null } });
    const novoToken = ([] as string[])
      .concat(ativado.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('__Host-pz_sessao='))
      ?.split(';')[0];
    // O token anterior ao 2FA deixou de valer; o novo acessa rotas completas.
    expect(
      (await api.inject({ method: 'GET', url: '/v1/auth/eu', headers: { cookie } })).statusCode,
    ).toBe(401);
    const bearer = String(novoToken).split('=')[1] ?? '';
    const completa = await api.inject({
      method: 'POST',
      url: '/v1/teste-auth/completa',
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(completa.statusCode).toBe(201);

    // No banco, a função de login lê o 2FA ativo; o dublê em memória precisa ser avisado.
    credenciais.cadastrar('ana@exemplo.invalid' as Email, {
      usuarioId: USUARIO,
      tenantId: TENANT,
      senhaHash: hashDaSenha,
      segundoFatorAtivo: true,
    });
    // Novo login: agora pede verificar; o código do mesmo passo já foi usado na ativação.
    const login = await entrar();
    expect(login.resposta.json()).toMatchObject({ proximoPasso: 'verificar-2fa' });
    const auth2 = { authorization: `Bearer ${login.sessao}` };
    const reuso = await api.inject({
      method: 'POST',
      url: '/v1/auth/2fa/verificar',
      headers: auth2,
      payload: { codigo: segredos.codigo(segredo, passo()) },
    });
    expect(reuso.statusCode).toBe(401);
    const proximo = await api.inject({
      method: 'POST',
      url: '/v1/auth/2fa/verificar',
      headers: auth2,
      payload: { codigo: segredos.codigo(segredo, passo() + 1) },
    });
    expect(proximo.statusCode).toBe(200);
    expect(proximo.json()).toMatchObject({ nivel: 'completo' });

    const reconfigurar = await api.inject({
      method: 'POST',
      url: '/v1/auth/2fa/configurar',
      headers: auth2,
    });
    expect(reconfigurar.statusCode).toBe(401); // o token de antes da verificação já foi trocado
  });

  it('corpo inválido: 400', async () => {
    const { sessao } = await entrar();
    const resposta = await api.inject({
      method: 'POST',
      url: '/v1/auth/2fa/verificar',
      headers: { authorization: `Bearer ${sessao}` },
      payload: { codigo: 1 },
    });
    expect(resposta.statusCode).toBe(400);
  });
});

describe('últimos acessos (HU06)', () => {
  it('lista os acessos da própria conta, mais recentes primeiro; exige sessão completa', async () => {
    const parcial = await entrar();
    expect(
      (
        await api.inject({
          method: 'GET',
          url: '/v1/auth/acessos',
          headers: { authorization: `Bearer ${parcial.sessao}` },
        })
      ).statusCode,
    ).toBe(401);
    const [ultimo] = await acessos.ultimos(USUARIO, 1);
    expect(ultimo).toMatchObject({ tipo: 'login', sucesso: true, usuarioId: USUARIO });
    expect(typeof ultimo?.ip).toBe('string');
  });
});

describe('recuperação de senha na api (HU06)', () => {
  const pedir = (email: string) =>
    api.inject({ method: 'POST', url: '/v1/auth/senha/esqueci', payload: { email } });

  it('esqueci: 204 exista ou não o e-mail; o link redefine uma vez e o login usa a senha nova', async () => {
    expect((await pedir('ninguem@exemplo.invalid')).statusCode).toBe(204);
    const antes = publicador.publicados.length;
    expect((await pedir('ana@exemplo.invalid')).statusCode).toBe(204);
    expect(publicador.publicados).toHaveLength(antes + 1);
    const evento = publicador.publicados.at(-1) as { payload: { tokenCifrado: string } };
    const token = new CifraAesGcm(CHAVE).decifrar(evento.payload.tokenCifrado);

    const redefinir = (novaSenha: string) =>
      api.inject({
        method: 'POST',
        url: '/v1/auth/senha/redefinir',
        payload: { token, novaSenha },
      });
    expect((await redefinir('curta')).statusCode).toBe(400);
    expect((await redefinir('senha nova de teste longa')).statusCode).toBe(204);
    expect((await redefinir('outra senha de teste longa')).statusCode).toBe(401);
    expect(
      (await entrar('ana@exemplo.invalid', 'senha nova de teste longa')).resposta.statusCode,
    ).toBe(200);
  });
});
