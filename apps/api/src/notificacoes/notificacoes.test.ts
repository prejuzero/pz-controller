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
import { ConsultarAvisosDeEntrega, NotificacoesEmMemoria } from '@pz/notificacoes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CodigoPerfil } from '@pz/identidade';

/** Avisos de entrega do portal (HU30). Dados FICTÍCIOS (e-mails .invalid). */
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
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
    avisosDeEntrega: (r) =>
      new ConsultarAvisosDeEntrega(
        outbox,
        new NotificacoesEmMemoria(),
        { emails: () => Promise.resolve({ principal: 'ana@exemplo.invalid', copias: [] }) },
        {
          suprimidos: (_tx, emails) => Promise.resolve(new Set(emails)),
          suprimir: () => Promise.resolve(),
        },
        r,
      ),
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await api.close();
});

async function sessaoCom(perfil: CodigoPerfil): Promise<string> {
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
  });
  return token;
}

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
});
