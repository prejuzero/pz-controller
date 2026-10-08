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
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CodigoPerfil } from '@pz/identidade';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';
import type { PublicacaoDoTenant, RepositorioDeLeitura } from '@pz/publicacoes';

/** Publicações do escritório (HU18). Dados FICTÍCIOS. */
const PLATAFORMA = gerarUuidV7();
const ESCRITORIO = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const auditados: string[] = [];
let api: NestFastifyApplication;
const termos = termosEmMemoria();
const ID = gerarUuidV7();
const publicacao: PublicacaoDoTenant = {
  id: ID,
  fonte: 'djen',
  idExterno: '1',
  numeroCnj: null,
  dataDisponibilizacao: '2026-10-06',
  teor: 'Intimação FICTÍCIA.',
  urlFonte: 'https://exemplo.invalid/certidao',
  processoId: null,
  oabId: null,
  recebidaEm: new Date('2026-10-07T10:00:00Z'),
  capturadoEm: new Date('2026-10-07T09:00:00Z'),
  lidaEm: null,
  lidaPor: null,
  siglaTribunal: 'TJSP',
  tipoComunicacao: 'Intimação',
};
const lidas: Uuid[] = [];
const leitura: RepositorioDeLeitura<TransacaoEmMemoria> = {
  listar: () => Promise.resolve([publicacao]),
  buscar: (_tx, id) => Promise.resolve(id === ID ? publicacao : undefined),
  marcarLida: (_tx, id) => Promise.resolve(id === ID && lidas.push(id) === 1),
};

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
    publicacoes: {
      unidade: new OutboxEmMemoria(),
      leitura: leitura,
      trilha: { registrar: (_tx, e) => Promise.resolve(void auditados.push(e.tipo)) },
    },
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
  await entrarComo('caio', 'advogado', ESCRITORIO);
});

afterAll(async () => {
  await api.close();
});

describe('publicações do escritório (HU18)', () => {
  it('lista, detalha e marca como lida uma vez; inexistente é 404', async () => {
    const lista = await pedir('caio', 'GET', '/v1/publicacoes?novas=true&limite=10');
    expect(lista.statusCode).toBe(200);
    expect(lista.json()).toMatchObject({
      itens: [{ id: ID, siglaTribunal: 'TJSP', lidaEm: null }],
      proximoCursor: null,
    });
    expect((await pedir('caio', 'GET', `/v1/publicacoes/${ID}`)).json()).toMatchObject({
      teor: 'Intimação FICTÍCIA.',
      capturadoEm: '2026-10-07T09:00:00.000Z',
    });
    expect((await pedir('caio', 'POST', `/v1/publicacoes/${ID}/lida`)).statusCode).toBe(204);
    expect((await pedir('caio', 'POST', `/v1/publicacoes/${ID}/lida`)).statusCode).toBe(204);
    expect(auditados.filter((t) => t === 'publicacoes.publicacao-lida')).toHaveLength(1);
    expect((await pedir('caio', 'GET', `/v1/publicacoes/${gerarUuidV7()}`)).statusCode).toBe(404);
    expect((await pedir('caio', 'POST', `/v1/publicacoes/${gerarUuidV7()}/lida`)).statusCode).toBe(
      404,
    );
    expect((await pedir('caio', 'GET', '/v1/publicacoes/abc')).statusCode).toBe(400);
    expect((await pedir('caio', 'GET', '/v1/publicacoes?limite=0')).statusCode).toBe(400);
  });
});
