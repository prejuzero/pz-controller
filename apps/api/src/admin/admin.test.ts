import { randomBytes } from 'node:crypto';

import { Controller, Get } from '@nestjs/common';
import { carregarAmbiente } from '@pz/config/env';
import { tenantAtual } from '@pz/db';
import {
  AcessosEmMemoria,
  CredenciaisEmMemoria,
  DURACAO_DA_IMPERSONACAO_MS,
  PerfisEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TenantsEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { obterContexto } from '@pz/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { RequerPermissao } from '../http/acesso.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { EntradaDeAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { TransacaoEmMemoria } from '@pz/kernel';

/** Impersonação pela API (HU07, PZ-105): tenant efetivo, só leitura, validade e auditoria. */

@Controller('v1/teste-impersonacao')
class LeituraDeTeste {
  @Get()
  @RequerPermissao('prazos:ler')
  ler() {
    const { userId, impersonacaoId } = obterContexto();
    return { tenant: tenantAtual(), userId, impersonacaoId };
  }
}

const PLATAFORMA = gerarUuidV7();
const ESCRITORIO = gerarUuidV7();
const ADMIN = gerarUuidV7();
const relogio = new FixedClock(Instant.deIso('2026-10-06T12:00:00Z'));
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const tenants = new TenantsEmMemoria();
const registros: { tenant: string | undefined; entrada: EntradaDeAuditoria }[] = [];
const trilha: TrilhaDeAuditoria<TransacaoEmMemoria> = {
  registrar(tx, entrada) {
    const tenant = tenantAtual();
    tx.aoConfirmar(() => registros.push({ tenant, entrada }));
    return Promise.resolve();
  },
};
const token = randomBytes(32).toString('base64url');
const autorizacao = { authorization: `Bearer ${token}` };
let api: NestFastifyApplication;

beforeAll(async () => {
  tenants.cadastrar(PLATAFORMA, 'plataforma');
  tenants.cadastrar(ESCRITORIO, 'escritorio');
  perfis.atribuir(ADMIN, 'admin_plataforma');
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
    controllersExtras: [LeituraDeTeste],
    identidade: {
      credenciais: new CredenciaisEmMemoria(),
      sessoes,
      segundoFator: new SegundoFatorEmMemoria(),
      tentativas: new TentativasEmMemoria(),
      acessos: new AcessosEmMemoria(),
      perfis,
      impersonacao: { unidade: new OutboxEmMemoria(), tenants, trilha },
    },
    janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
});

beforeEach(async () => {
  registros.length = 0;
  const agora = relogio.agora();
  await sessoes.gravar(token, {
    id: gerarUuidV7(),
    usuarioId: ADMIN,
    tenantId: PLATAFORMA,
    nivel: 'completo',
    segundoFatorAtivo: true,
    criadaEm: agora,
    ultimoUso: agora,
  });
});

afterAll(async () => {
  await api.close();
});

const iniciar = (
  payload: Record<string, string> = { tenantId: ESCRITORIO, motivo: 'Chamado 42: conferir' },
) => api.inject({ method: 'POST', url: '/v1/admin/impersonacao', headers: autorizacao, payload });
const ler = () =>
  api.inject({ method: 'GET', url: '/v1/teste-impersonacao', headers: autorizacao });

describe('impersonação pela API (HU07)', () => {
  it('sem impersonação, o admin não lê dados de tenant', async () => {
    expect((await ler()).statusCode).toBe(403);
  });

  it('inicia: 201, faixa em /v1/auth/eu, requisições no tenant acessado e só leitura', async () => {
    const resposta = await iniciar();
    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json<{ permissoes: string[]; impersonacao: { tenantId: string } }>();
    expect(corpo.impersonacao.tenantId).toBe(ESCRITORIO);
    expect(corpo.permissoes).not.toContain('conta:gerir');
    expect(corpo.permissoes).toContain('prazos:ler');

    const eu = await api.inject({ method: 'GET', url: '/v1/auth/eu', headers: autorizacao });
    expect(eu.json<{ tenantId: string; impersonacao: unknown }>()).toMatchObject({
      tenantId: PLATAFORMA,
      impersonacao: { tenantId: ESCRITORIO, motivo: 'Chamado 42: conferir' },
    });
    const leitura = (await ler()).json<Record<string, string>>();
    expect(leitura).toMatchObject({ tenant: ESCRITORIO, userId: ADMIN });
    expect(leitura.impersonacaoId).toEqual(expect.any(String));
    const escrita = await api.inject({
      method: 'GET',
      url: '/v1/auth/acessos',
      headers: autorizacao,
    });
    expect(escrita.statusCode).toBe(403);
    expect(registros.map((r) => r.tenant)).toEqual([ESCRITORIO, PLATAFORMA]);
  });

  it('segunda impersonação em curso: 409; motivo curto: 400; tenant desconhecido: 404', async () => {
    expect((await iniciar({ tenantId: ESCRITORIO, motivo: 'curto' })).statusCode).toBe(400);
    expect(
      (await iniciar({ tenantId: gerarUuidV7(), motivo: 'Chamado 42: conferir' })).statusCode,
    ).toBe(404);
    expect((await iniciar()).statusCode).toBe(201);
    expect((await iniciar()).statusCode).toBe(409);
  });

  it('encerra pelo DELETE e vence sozinha em 60 minutos', async () => {
    await iniciar();
    const fim = await api.inject({
      method: 'DELETE',
      url: '/v1/admin/impersonacao',
      headers: autorizacao,
    });
    expect(fim.statusCode).toBe(204);
    expect((await ler()).statusCode).toBe(403);
    expect(registros.at(-1)?.entrada.tipo).toBe('identidade.impersonacao-encerrada');

    await iniciar();
    expect((await ler()).statusCode).toBe(200);
    relogio.avancarMs(DURACAO_DA_IMPERSONACAO_MS);
    expect((await ler()).statusCode).toBe(403);
    const eu = await api.inject({ method: 'GET', url: '/v1/auth/eu', headers: autorizacao });
    expect(eu.json<{ impersonacao: unknown }>().impersonacao).toBeNull();
  });
});
