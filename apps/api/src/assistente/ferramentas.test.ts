import { randomBytes } from 'node:crypto';

import { carregarAmbiente } from '@pz/config/env';
import { CatalogoDeFerramentas } from '@pz/ia';
import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  PerfisEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { FixedClock, gerarUuidV7, Instant, ok } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Ferramenta } from '@pz/ia';

/** Catálogo pela API para assistentes externos (HU60). Ferramentas e dados FICTÍCIOS. */
const relogio = new FixedClock(Instant.deIso('2026-11-08T12:00:00Z'));
const ESCRITORIO = gerarUuidV7();
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const auditadas: { nome: string; canal: string; tenantId: string; resultado: string }[] = [];

const ferramenta = (nome: string, permissao: 'prazos:ler' | 'publicacoes:ler') =>
  ({
    nome,
    descricao: `Ferramenta fictícia ${nome}.`,
    permissao,
    alteraEstado: false,
    entrada: z.object({ texto: z.string().max(10) }).strict(),
    saida: z.object({ eco: z.string() }),
    executar: (e: { texto: string }) => Promise.resolve(ok({ eco: e.texto })),
  }) satisfies Ferramenta<{ texto: string }, { eco: string }>;

const catalogo = new CatalogoDeFerramentas(
  [ferramenta('buscar_prazos', 'prazos:ler'), ferramenta('buscar_publicacoes', 'publicacoes:ler')],
  (c, e) => {
    auditadas.push({ nome: e.nome, canal: c.canal, tenantId: c.tenantId, resultado: e.resultado });
    return Promise.resolve();
  },
);

let api: NestFastifyApplication;
const tokens = new Map<string, string>();

async function entrar(quem: string, escopos?: string[]) {
  const usuarioId = gerarUuidV7();
  perfis.atribuir(usuarioId, 'advogado');
  const token = randomBytes(32).toString('base64url');
  await sessoes.gravar(token, {
    id: gerarUuidV7(),
    usuarioId,
    tenantId: ESCRITORIO,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: relogio.agora(),
    ultimoUso: relogio.agora(),
    ...(escopos === undefined ? {} : { dispositivoId: gerarUuidV7(), escopos }),
  });
  tokens.set(quem, token);
}

const pedir = (quem: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  api.inject({
    method,
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
    catalogoDeFerramentas: catalogo,
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  await entrar('assistente', ['prazos:ler']);
  await entrar('portal');
});

afterAll(async () => {
  await api.close();
});

describe('ferramentas de IA pela API (HU60)', () => {
  it('o assistente vê só o que os escopos permitem, executa com aviso e fica na trilha', async () => {
    const lista = await pedir('assistente', 'GET', '/v1/ia/ferramentas');
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toMatchObject({
      itens: [{ nome: 'buscar_prazos', entrada: { type: 'object' } }],
      aviso: expect.stringContaining('motor de prazos') as unknown,
    });
    const r = await pedir('assistente', 'POST', '/v1/ia/ferramentas/buscar_prazos', {
      argumentos: { texto: 'oi' },
    });
    expect(r.json()).toMatchObject({ resultado: { eco: 'oi' } });
    // Fora dos escopos: proibida e auditada.
    expect(
      (
        await pedir('assistente', 'POST', '/v1/ia/ferramentas/buscar_publicacoes', {
          argumentos: { texto: 'oi' },
        })
      ).statusCode,
    ).toBe(403);
    expect(auditadas).toEqual([
      { nome: 'buscar_prazos', canal: 'mcp', tenantId: ESCRITORIO, resultado: 'ok' },
      { nome: 'buscar_publicacoes', canal: 'mcp', tenantId: ESCRITORIO, resultado: 'proibida' },
    ]);
  });

  it('pelo portal todas as ferramentas do perfil; erros no formato do contrato', async () => {
    const lista = await pedir('portal', 'GET', '/v1/ia/ferramentas');
    expect(lista.json<{ itens: { nome: string }[] }>().itens.map((f) => f.nome)).toEqual([
      'buscar_prazos',
      'buscar_publicacoes',
    ]);
    const inexistente = await pedir('portal', 'POST', '/v1/ia/ferramentas/apagar_tudo', {
      argumentos: {},
    });
    expect(inexistente.statusCode).toBe(404);
    expect(
      (
        await pedir('portal', 'POST', '/v1/ia/ferramentas/buscar_prazos', {
          argumentos: { texto: 'longo demais aqui' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await pedir('portal', 'POST', '/v1/ia/ferramentas/Nome-Invalido', { argumentos: {} }))
        .statusCode,
    ).toBe(400);
    expect((await api.inject({ method: 'GET', url: '/v1/ia/ferramentas' })).statusCode).toBe(401);
  });
});
