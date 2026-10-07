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
import { TabelaEmMemoria } from '@pz/prazos';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';

import { termosEmMemoria } from './termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CodigoPerfil } from '@pz/identidade';

/** Aceite versionado de termos (HU38). Documentos FICTÍCIOS. */
const PLATAFORMA = gerarUuidV7();
const ESCRITORIO = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const auditados: string[] = [];
let api: NestFastifyApplication;
const termos = termosEmMemoria();
const documento = (versao: string, publicado: string) => ({
  id: gerarUuidV7(),
  tipo: 'termos' as const,
  versao,
  conteudo: 'FICTÍCIO: termos de uso de teste',
  publicadoEm: Instant.deIso(publicado),
});
const V1 = documento('1.0', '2026-10-01T00:00:00Z');
// Publicado depois do início das sessões do teste: só vale no próximo login.
const V2 = documento('2.0', '2026-12-01T00:00:00Z');

const tokens = new Map<string, string>();
async function entrarComo(nome: string, perfil: CodigoPerfil, tenantId: string) {
  const usuarioId = gerarUuidV7();
  perfis.atribuir(usuarioId, perfil);
  const token = randomBytes(32).toString('base64url');
  const agora = relogio.agora();
  await sessoes.gravar(token, {
    id: gerarUuidV7(),
    usuarioId,
    tenantId: tenantId as never,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: agora,
    ultimoUso: agora,
  });
  tokens.set(nome, token);
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
    termos: termos.dependencias,
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
    tabelaDePrazos: (() => {
      const tabela = new TabelaEmMemoria();
      return {
        unidade: new OutboxEmMemoria(),
        tipos: tabela,
        tabela,
        trilha: {
          registrar: (tx, entrada) => {
            (tx as { aoConfirmar(f: () => void): void }).aoConfirmar(() =>
              auditados.push(entrada.tipo),
            );
            return Promise.resolve();
          },
        },
        outbox: new OutboxEmMemoria(),
      };
    })(),
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  await entrarComo('ana', 'curador', PLATAFORMA);
  await entrarComo('beto', 'curador', PLATAFORMA);
  await entrarComo('caio', 'advogado', ESCRITORIO);
});

afterAll(async () => {
  await api.close();
});

describe('aceite de termos (HU38)', () => {
  it('termos pendentes bloqueiam o uso até o aceite; aceite fica no histórico', async () => {
    termos.repositorio.documentos.push(V1, V2);
    const bloqueada = await pedir('ana', 'GET', '/v1/admin/tabela-prazos');
    expect(bloqueada.statusCode).toBe(403);
    expect(bloqueada.json<{ codigo: string }>().codigo).toBe('termos-pendentes');
    expect((await pedir('ana', 'GET', '/v1/auth/eu')).json()).toMatchObject({
      proximoPasso: 'aceitar-termos',
    });
    const pendentes = await pedir('ana', 'GET', '/v1/termos/pendentes');
    expect(pendentes.json<{ itens: { id: string; versao: string }[] }>().itens).toEqual([
      expect.objectContaining({ id: V1.id, versao: '1.0' }),
    ]);

    expect((await pedir('ana', 'POST', `/v1/termos/${V2.id}/aceitar`)).statusCode).toBe(404);
    expect((await pedir('ana', 'POST', `/v1/termos/${V1.id}/aceitar`)).statusCode).toBe(204);
    expect((await pedir('ana', 'GET', '/v1/admin/tabela-prazos')).statusCode).toBe(200);
    expect((await pedir('ana', 'GET', '/v1/auth/eu')).json()).toMatchObject({ proximoPasso: null });
    expect(
      (await pedir('ana', 'GET', '/v1/termos/aceites')).json<{ itens: { versao: string }[] }>()
        .itens,
    ).toEqual([expect.objectContaining({ versao: '1.0' })]);

    // O aceite é do usuário: outro curador continua bloqueado.
    expect((await pedir('beto', 'GET', '/v1/admin/tabela-prazos')).statusCode).toBe(403);
  });

  it('rotas de termos exigem sessão; id inválido é 400', async () => {
    expect((await api.inject({ method: 'GET', url: '/v1/termos/pendentes' })).statusCode).toBe(401);
    expect((await pedir('ana', 'POST', '/v1/termos/x/aceitar')).statusCode).toBe(400);
  });
});
