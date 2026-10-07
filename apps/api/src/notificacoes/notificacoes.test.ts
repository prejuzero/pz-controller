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
import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { ConsentimentosEmMemoria, NotificacoesEmMemoria } from '@pz/notificacoes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CodigoPerfil } from '@pz/identidade';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Avisos de entrega do portal (HU30). Dados FICTÍCIOS (e-mails .invalid). */
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const auditados: string[] = [];
let api: NestFastifyApplication;

beforeAll(async () => {
  const outbox = new OutboxEmMemoria();
  api = await criarApi({
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
    },
    janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
    notificacoes: () => {
      const consentimentos = new ConsentimentosEmMemoria();
      return {
        unidade: outbox,
        notificacoes: new NotificacoesEmMemoria(),
        destinos: {
          emails: () => Promise.resolve({ principal: 'ana@exemplo.invalid', copias: [] }),
        },
        supressao: {
          suprimidos: (_tx, emails) => Promise.resolve(new Set(emails)),
          suprimir: () => Promise.resolve(),
        },
        consentimentos,
        push: consentimentos,
        trilha: {
          registrar: (tx, entrada) => {
            (tx as TransacaoEmMemoria).aoConfirmar(() => auditados.push(entrada.tipo));
            return Promise.resolve();
          },
        },
        outbox,
      };
    },
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await api.close();
});

async function sessaoCom(perfil: CodigoPerfil, dispositivoId?: Uuid): Promise<string> {
  const usuarioId = gerarUuidV7();
  perfis.atribuir(usuarioId, perfil);
  const token = randomBytes(32).toString('base64url');
  await sessoes.gravar(token, {
    id: gerarUuidV7(),
    usuarioId,
    tenantId: gerarUuidV7(),
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: relogio.agora(),
    ultimoUso: relogio.agora(),
    ...(dispositivoId === undefined ? {} : { dispositivoId }),
  });
  return token;
}

const pedir = (
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  api.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload }),
  });

const consultar = (token?: string) =>
  api.inject({
    method: 'GET',
    url: '/v1/notificacoes/avisos',
    ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }),
  });

describe('avisos de entrega pela API (HU30)', () => {
  it('advogado vê os próprios e-mails rejeitados; administrador, também a equipe', async () => {
    const advogado = await consultar(await sessaoCom('advogado'));
    expect(advogado.statusCode).toBe(200);
    expect(advogado.json()).toEqual({
      emailsRejeitados: ['ana@exemplo.invalid'],
      usuariosDaEquipeComRejeicao: null,
    });
    const admin = await consultar(await sessaoCom('admin_escritorio'));
    expect(admin.json()).toMatchObject({ usuariosDaEquipeComRejeicao: 0 });
  });

  it('sem sessão, 401', async () => {
    expect((await consultar()).statusCode).toBe(401);
  });

  it('consentimentos: concede (idempotente), lista, revoga; e-mail e telefone inválido, 400', async () => {
    const token = await sessaoCom('advogado');
    const url = '/v1/notificacoes/consentimentos';
    const pedido = { canal: 'sms', destino: '+5511987654321' };
    const criado = await pedir(token, 'POST', url, pedido);
    expect(criado.statusCode).toBe(201);
    const { id } = criado.json<{ id: string }>();
    expect((await pedir(token, 'POST', url, pedido)).json<{ id: string }>().id).toBe(id);
    expect((await pedir(token, 'GET', url)).json<{ itens: unknown[] }>().itens).toHaveLength(1);
    expect((await pedir(token, 'POST', url, { canal: 'email', destino: 'a@b.c' })).statusCode).toBe(
      400,
    );
    expect((await pedir(token, 'POST', url, { canal: 'sms', destino: '119' })).statusCode).toBe(
      400,
    );
    expect((await pedir(token, 'DELETE', `${url}/${id}`)).statusCode).toBe(204);
    expect((await pedir(token, 'GET', url)).json<{ itens: unknown[] }>().itens).toHaveLength(0);
    expect((await pedir(token, 'DELETE', `${url}/x`)).statusCode).toBe(400);
    const outro = await sessaoCom('advogado');
    const alheio = await pedir(token, 'POST', url, pedido);
    const idAlheio = alheio.json<{ id: string }>().id;
    expect((await pedir(outro, 'DELETE', `${url}/${idAlheio}`)).statusCode).toBe(404);
  });

  it('destino de push: só na sessão de um dispositivo; desativar é idempotente', async () => {
    const url = '/v1/notificacoes/destino-push';
    const corpo = { plataforma: 'android', token: 'token-ficticio' };
    const portal = await sessaoCom('advogado');
    expect((await pedir(portal, 'PUT', url, corpo)).statusCode).toBe(400);
    const dispositivoId = gerarUuidV7();
    const app = await sessaoCom('advogado', dispositivoId);
    const r = await pedir(app, 'PUT', url, corpo);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ dispositivoId });
    expect((await pedir(app, 'DELETE', url)).statusCode).toBe(204);
    expect((await pedir(app, 'DELETE', url)).statusCode).toBe(204);
    expect(auditados).toEqual(
      expect.arrayContaining([
        'notificacoes.destino-push-registrado',
        'notificacoes.destino-push-desativado',
      ]),
    );
  });
});
