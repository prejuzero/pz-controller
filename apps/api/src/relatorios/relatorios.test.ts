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
import { RelatoriosEmMemoria } from '@pz/relatorios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { termosEmMemoria } from '../termos/termos-de-teste.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CodigoPerfil } from '@pz/identidade';
import type { ArmazenamentoArquivos } from '@pz/integracoes';

/** Relatórios (HU29): pedido, lista e consulta pela API. Dados FICTÍCIOS. */
const PLATAFORMA = gerarUuidV7();
const ESCRITORIO = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-11-02T15:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const auditados: string[] = [];
let api: NestFastifyApplication;
const termos = termosEmMemoria();
const relatorios = new RelatoriosEmMemoria();
const unidade = new OutboxEmMemoria();
const armazenamento = {
  urlAssinada: (p: { caminho: string }) => Promise.resolve(`https://exemplo.invalid/${p.caminho}`),
} as unknown as ArmazenamentoArquivos;

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
    relatorios: {
      unidade,
      relatorios,
      trilha: { registrar: () => Promise.resolve() },
      outbox: unidade,
      armazenamento,
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
  await entrarComo('ana', 'advogado', ESCRITORIO);
  await entrarComo('beto', 'advogado', ESCRITORIO);
  await entrarComo('cura', 'curador', PLATAFORMA);
});

afterAll(async () => {
  await api.close();
});

describe('relatórios (HU29)', () => {
  it('pede, lista e consulta; outro usuário não vê; pedido inválido é 400', async () => {
    const pedido = await pedir('ana', 'POST', '/v1/relatorios', {
      tipo: 'agenda',
      formato: 'pdf',
      filtros: { de: '2026-11-01', ate: '2026-11-30' },
    });
    expect(pedido.statusCode).toBe(202);
    const { id } = pedido.json<{ id: string }>();
    const lista = await pedir('ana', 'GET', '/v1/relatorios');
    expect(lista.json()).toMatchObject({ itens: [{ id, situacao: 'pendente', url: null }] });
    expect((await pedir('ana', 'GET', `/v1/relatorios/${id}`)).json()).toMatchObject({
      id,
      tipo: 'agenda',
      formato: 'pdf',
    });
    expect((await pedir('beto', 'GET', `/v1/relatorios/${id}`)).statusCode).toBe(404);
    expect((await pedir('beto', 'GET', '/v1/relatorios')).json()).toEqual({ itens: [] });
    expect((await pedir('ana', 'GET', '/v1/relatorios/nao-e-uuid')).statusCode).toBe(400);
    expect(
      (
        await pedir('ana', 'POST', '/v1/relatorios', {
          tipo: 'agenda',
          formato: 'csv',
          filtros: {},
        })
      ).statusCode,
    ).toBe(400);
  });

  it('exige relatorios:exportar', async () => {
    expect((await pedir('cura', 'GET', '/v1/relatorios')).statusCode).toBe(403);
  });
});
