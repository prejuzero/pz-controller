import { randomBytes } from 'node:crypto';

import { CuradoriaDasRegras } from '@pz/classificacao';
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { RepositorioDaCuradoriaDeRegras, VersaoDaRegra } from '@pz/classificacao';
import type { CodigoPerfil } from '@pz/identidade';

/** Curadoria das regras rápidas pela API (PZ-313). Regras FICTÍCIAS. */
const relogio = new FixedClock(Instant.deIso('2026-11-11T12:00:00Z'));
const PLATAFORMA = gerarUuidV7();
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
let regras: VersaoDaRegra[] = [];
const repo: RepositorioDaCuradoriaDeRegras<unknown> = {
  listar: () => Promise.resolve([...regras]),
  versao: (_t, c, v) => Promise.resolve(regras.find((r) => r.codigo === c && r.versao === v)),
  proximaVersao: (_t, c) =>
    Promise.resolve(Math.max(0, ...regras.filter((r) => r.codigo === c).map((r) => r.versao)) + 1),
  tipoAtoExiste: () => Promise.resolve(true),
  inserir: (_t, r) => Promise.resolve(void regras.push(r)),
  ativar: (_t, c, v, por) => {
    regras = regras.map((r) =>
      r.codigo === c && r.versao === v ? { ...r, ativa: true, ativadaPor: por } : r,
    );
    return Promise.resolve();
  },
  retirar: (_t, c) => {
    const n = regras.filter((r) => r.codigo === c && r.ativa).length;
    regras = regras.map((r) => (r.codigo === c ? { ...r, ativa: false } : r));
    return Promise.resolve(n);
  },
};
let api: NestFastifyApplication;
const tokens = new Map<string, string>();

async function entrar(nome: string, perfil: CodigoPerfil) {
  const usuarioId = gerarUuidV7();
  perfis.atribuir(usuarioId, perfil);
  const token = randomBytes(32).toString('base64url');
  await sessoes.gravar(token, {
    id: gerarUuidV7(),
    usuarioId,
    tenantId: PLATAFORMA,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: relogio.agora(),
    ultimoUso: relogio.agora(),
  });
  tokens.set(nome, token);
}
const pedir = (quem: string, url: string, payload?: object) =>
  api.inject({
    method:
      payload === undefined && !url.endsWith('ativar') && !url.endsWith('retirar') ? 'GET' : 'POST',
    url,
    headers: { authorization: `Bearer ${tokens.get(quem) ?? ''}` },
    ...(payload === undefined ? {} : { payload }),
  });

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
    },
    janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
    curadoriaDeRegras: new CuradoriaDasRegras(
      new OutboxEmMemoria(),
      repo,
      { registrar: () => Promise.resolve() },
      relogio,
    ),
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  await entrar('ana', 'curador');
  await entrar('bia', 'curador');
  await entrar('caio', 'advogado');
});

afterAll(async () => {
  await api.close();
});

describe('regras rápidas pela curadoria (PZ-313)', () => {
  it('propõe, a própria curadora ativa, lista a situação e retira', async () => {
    const base = '/v1/admin/classificacoes/regras';
    const criada = await pedir('ana', base, {
      codigo: 'contestacao-intime',
      tipoAto: 'contestacao',
      padroes: ['\\bcontestacao\\b'],
      confianca: 0.95,
    });
    expect(criada.statusCode).toBe(201);
    expect(criada.json()).toMatchObject({ versao: 1, situacao: 'proposta' });
    expect((await pedir('ana', `${base}/contestacao-intime/1/ativar`)).statusCode).toBe(204);
    expect((await pedir('ana', base)).json()).toMatchObject({ itens: [{ situacao: 'ativa' }] });
    expect((await pedir('ana', `${base}/contestacao-intime/retirar`)).statusCode).toBe(204);
    expect((await pedir('ana', base)).json()).toMatchObject({ itens: [{ situacao: 'retirada' }] });
    expect((await pedir('ana', `${base}/nao-existe/retirar`)).statusCode).toBe(404);
    expect((await pedir('ana', `${base}/contestacao-intime/x/ativar`)).statusCode).toBe(400);
    expect(
      (await pedir('ana', base, { codigo: 'x', tipoAto: 'a', padroes: ['(a+)+'], confianca: 2 }))
        .statusCode,
    ).toBe(400);
    expect((await pedir('caio', base)).statusCode).toBe(403);
  });
});
