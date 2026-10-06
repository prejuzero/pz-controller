import { randomBytes } from 'node:crypto';

import { EventosGlobaisEmMemoria, FeriadosLocaisEmMemoria } from '@pz/calendario';
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

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CodigoPerfil } from '@pz/identidade';

/** Rotas do calendário forense (HU13). Dados FICTÍCIOS: só exercitam o mecanismo. */
const PLATAFORMA = gerarUuidV7();
const ESCRITORIO = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const tipos: string[] = [];
let api: NestFastifyApplication;

const evento = (parcial: Record<string, unknown> = {}) => ({
  abrangencia: 'nacional',
  tipo: 'feriado',
  inicio: '2030-03-10',
  fim: '2030-03-10',
  descricao: 'FICTÍCIO: Dia de Teste',
  atoNormativo: 'FICTÍCIO: Lei de Teste, art. 1º',
  urlAto: 'https://exemplo.invalid/ficticio',
  ...parcial,
});

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
    calendario: {
      unidade: new OutboxEmMemoria(),
      globais: new EventosGlobaisEmMemoria(),
      locais: new FeriadosLocaisEmMemoria(),
      trilha: {
        registrar: (tx, entrada) => {
          (tx as { aoConfirmar(f: () => void): void }).aoConfirmar(() => tipos.push(entrada.tipo));
          return Promise.resolve();
        },
      },
      outbox: new OutboxEmMemoria(),
    },
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

describe('calendário global pela API (HU13)', () => {
  it('curador propõe, outro aprova (quatro olhos) e revoga com motivo', async () => {
    const proposta = await pedir('ana', 'POST', '/v1/admin/calendario', evento());
    expect(proposta.statusCode).toBe(201);
    const { id } = proposta.json<{ id: string }>();
    expect((await pedir('ana', 'POST', `/v1/admin/calendario/${id}/aprovar`)).statusCode).toBe(403);
    const aprovada = await pedir('beto', 'POST', `/v1/admin/calendario/${id}/aprovar`);
    expect([aprovada.statusCode, aprovada.json<{ status: string }>().status]).toEqual([
      200,
      'aprovado',
    ]);
    expect((await pedir('beto', 'POST', `/v1/admin/calendario/${id}/aprovar`)).statusCode).toBe(
      409,
    );
    const revogada = await pedir('ana', 'POST', `/v1/admin/calendario/${id}/revogar`, {
      motivo: 'ato revogado pelo tribunal',
    });
    expect(revogada.statusCode).toBe(200);
    const lista = await pedir(
      'ana',
      'GET',
      '/v1/admin/calendario?inicio=2030-01-01&fim=2030-12-31',
    );
    expect(lista.json<{ itens: unknown[] }>().itens).toHaveLength(1);
    expect(tipos).toEqual(
      expect.arrayContaining([
        'calendario.evento-proposto',
        'calendario.evento-aprovado',
        'calendario.evento-revogado',
      ]),
    );
  });

  it('entrada inválida: 400 com o campo; id inválido: 400; inexistente: 404', async () => {
    const r = await pedir('ana', 'POST', '/v1/admin/calendario', evento({ abrangencia: 'uf' }));
    expect(r.statusCode).toBe(400);
    expect(r.json<{ problemas: { campo: string }[] }>().problemas.map((p) => p.campo)).toEqual([
      'uf',
    ]);
    expect((await pedir('ana', 'POST', '/v1/admin/calendario/x/aprovar')).statusCode).toBe(400);
    const inexistente = await pedir('ana', 'POST', `/v1/admin/calendario/${gerarUuidV7()}/aprovar`);
    expect(inexistente.statusCode).toBe(404);
  });

  it('importação CSV: prévia sem gravar', async () => {
    const csv = [
      'abrangencia;uf;municipioIbge;tribunal;comarca;tipo;inicio;fim;descricao;atoNormativo;urlAto',
      'nacional;;;;;feriado;2031-01-02;2031-01-02;FICTÍCIO;FICTÍCIO: Lei 1;https://exemplo.invalid/c',
    ].join('\n');
    const r = await pedir('ana', 'POST', '/v1/admin/calendario/importacao', { csv });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ linhas: [{ linha: 2, problemas: [] }], propostos: [] });
  });

  it('o advogado não acessa o calendário global', async () => {
    expect((await pedir('caio', 'POST', '/v1/admin/calendario', evento())).statusCode).toBe(403);
  });
});

describe('feriados locais e dias não úteis pela API (HU13)', () => {
  it('advogado cadastra, consulta os dias da jurisdição e revoga', async () => {
    const local = await pedir(
      'caio',
      'POST',
      '/v1/calendario/locais',
      evento({
        abrangencia: 'comarca',
        tribunal: 'TJXA',
        comarca: 'Alfa',
        inicio: '2032-05-04',
        fim: '2032-05-04',
      }),
    );
    expect(local.statusCode).toBe(201);
    const { id } = local.json<{ id: string }>();
    const dias = await pedir(
      'caio',
      'GET',
      '/v1/calendario/dias-nao-uteis?tribunal=TJXA&comarca=Alfa&inicio=2032-05-01&fim=2032-05-31',
    );
    expect(dias.statusCode).toBe(200);
    expect(
      dias
        .json<{ itens: { data: string; fonte: { origem: string } }[] }>()
        .itens.map((d) => [d.data, d.fonte.origem]),
    ).toEqual([['2032-05-04', 'local']]);
    expect(
      (await pedir('caio', 'GET', '/v1/calendario/locais')).json<{ itens: unknown[] }>().itens,
    ).toHaveLength(1);
    expect((await pedir('caio', 'POST', `/v1/calendario/locais/${id}/revogar`)).statusCode).toBe(
      200,
    );
    expect((await pedir('caio', 'POST', `/v1/calendario/locais/${id}/revogar`)).statusCode).toBe(
      409,
    );
  });

  it('nacional pelo escritório: 400; período inválido: 400', async () => {
    expect((await pedir('caio', 'POST', '/v1/calendario/locais', evento())).statusCode).toBe(400);
    const r = await pedir(
      'caio',
      'GET',
      '/v1/calendario/dias-nao-uteis?inicio=2032-05-02&fim=2032-05-01',
    );
    expect(r.statusCode).toBe(400);
  });
});
