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

/** Rotas da tabela de prazos (HU15). Dados FICTÍCIOS: só exercitam o mecanismo, sem regra real. */
const PLATAFORMA = gerarUuidV7();
const ESCRITORIO = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const auditados: string[] = [];
const tiposAuditados = () => [...auditados];
let api: NestFastifyApplication;

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

const versao = {
  tipoAto: 'ficticio-contestacao',
  ramo: 'civel',
  dias: 15,
  unidade: 'dias',
  fundamento: 'FICTÍCIO: Lei de Teste, art. 1º',
  fonteUrl: 'https://exemplo.invalid/ficticio',
  vigenciaInicio: '2030-01-01',
};

describe('tabela de prazos (HU15)', () => {
  it('curador cadastra o ato, propõe a versão e outro curador aprova (quatro olhos)', async () => {
    const tipo = await pedir('ana', 'POST', '/v1/admin/tabela-prazos/tipos-de-ato', {
      codigo: 'ficticio-contestacao',
      nome: 'FICTÍCIO: Contestação',
      descricao: 'Só para teste.',
    });
    expect(tipo.statusCode).toBe(201);
    expect(tipo.json()).toMatchObject({ codigo: 'ficticio-contestacao', sinonimos: [] });
    expect(
      (
        await pedir('beto', 'POST', '/v1/admin/tabela-prazos/tipos-de-ato', {
          codigo: 'ficticio-contestacao',
          nome: 'Repetido',
          descricao: '',
        })
      ).statusCode,
    ).toBe(409);
    const tipos = await pedir('beto', 'GET', '/v1/admin/tabela-prazos/tipos-de-ato');
    expect(tipos.json<{ itens: unknown[] }>().itens).toHaveLength(1);

    const proposta = await pedir('ana', 'POST', '/v1/admin/tabela-prazos', versao);
    expect(proposta.statusCode).toBe(201);
    const { id } = proposta.json<{ id: string }>();
    expect(proposta.json()).toMatchObject({ versao: 1, status: 'rascunho', aprovadoPor: null });

    expect((await pedir('ana', 'POST', `/v1/admin/tabela-prazos/${id}/aprovar`)).statusCode).toBe(
      403,
    );
    const aprovada = await pedir('beto', 'POST', `/v1/admin/tabela-prazos/${id}/aprovar`);
    expect(aprovada.statusCode).toBe(200);
    expect(aprovada.json()).toMatchObject({ status: 'aprovado' });
    expect((await pedir('beto', 'POST', `/v1/admin/tabela-prazos/${id}/aprovar`)).statusCode).toBe(
      409,
    );

    const lista = await pedir(
      'ana',
      'GET',
      '/v1/admin/tabela-prazos?tipoAto=ficticio-contestacao&ramo=civel',
    );
    expect(lista.json<{ itens: { status: string }[] }>().itens.map((v) => v.status)).toEqual([
      'aprovado',
    ]);
    expect(tipos.statusCode).toBe(200);
    expect(tipos.json<{ itens: { codigo: string }[] }>().itens[0]?.codigo).toBe(
      'ficticio-contestacao',
    );
    expect(tiposAuditados()).toEqual([
      'prazos.tipo-de-ato-cadastrado',
      'prazos.versao-da-tabela-proposta',
      'prazos.versao-da-tabela-aprovada',
    ]);
  });

  it('advogado do escritório não acessa; entrada inválida é 400', async () => {
    expect((await pedir('caio', 'GET', '/v1/admin/tabela-prazos')).statusCode).toBe(403);
    expect((await pedir('caio', 'POST', '/v1/admin/tabela-prazos', versao)).statusCode).toBe(403);
    expect(
      (await pedir('ana', 'POST', '/v1/admin/tabela-prazos', { ...versao, fundamento: '' }))
        .statusCode,
    ).toBe(400);
    expect((await pedir('ana', 'GET', '/v1/admin/tabela-prazos?ramo=outro')).statusCode).toBe(400);
    expect((await pedir('ana', 'POST', '/v1/admin/tabela-prazos/x/aprovar')).statusCode).toBe(400);
  });
});
