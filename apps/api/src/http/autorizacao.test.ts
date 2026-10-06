import { randomBytes } from 'node:crypto';

import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { carregarAmbiente } from '@pz/config/env';
import {
  AcessosEmMemoria,
  concede,
  CredenciaisEmMemoria,
  DispositivosEmMemoria,
  PERFIS_PADRAO,
  PerfisEmMemoria,
  PublicadorEmMemoria,
  RedefinicoesEmMemoria,
  RenovacoesEmMemoria,
  SegundoFatorEmMemoria,
  SessoesEmMemoria,
  TentativasEmMemoria,
} from '@pz/identidade';
import { gerarUuidV7, SystemClock } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaApi } from '../ambiente.js';
import { criarApi } from '../app.js';
import { AppModule } from '../app.module.js';

import { declaracaoDeAcesso } from './acesso.js';

import type { OpcoesApi } from '../app.module.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CodigoPerfil, Permissao } from '@pz/identidade';

/** Matriz de autorização (HU07, PZ-107): gerada das rotas reais e do catálogo de perfis. */

interface RotaDescoberta {
  readonly nome: string;
  readonly metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly publica: boolean;
  readonly parcial: boolean;
  readonly permissoes: readonly Permissao[] | undefined;
}

const TENANT = gerarUuidV7();
const sessoes = new SessoesEmMemoria();
const perfis = new PerfisEmMemoria();
const ambiente = carregarAmbiente(esquemaApi, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
  REDIS_URL: 'redis://127.0.0.1:6379',
  S3_REGION: 'us-east-1',
  CHAVE_CIFRAGEM: randomBytes(32).toString('base64'),
});
const opcoes: OpcoesApi = {
  ambiente,
  verificadores: [],
  identidade: {
    credenciais: new CredenciaisEmMemoria(),
    sessoes,
    segundoFator: new SegundoFatorEmMemoria(),
    tentativas: new TentativasEmMemoria(),
    acessos: new AcessosEmMemoria(),
    publicador: new PublicadorEmMemoria(),
    redefinicoes: new RedefinicoesEmMemoria(),
    dispositivos: new DispositivosEmMemoria(),
    renovacoes: new RenovacoesEmMemoria(),
    perfis,
  },
  janelaDeRequisicoes: { registrar: () => Promise.resolve(1) },
};

/** Todas as rotas dos controllers da api, com o que cada uma declara. */
function descobrirRotas(): RotaDescoberta[] {
  const refletor = new Reflector();
  const rotas: RotaDescoberta[] = [];
  for (const controller of AppModule.registrar(opcoes).controllers ?? []) {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const prototipo = controller.prototype as Record<string, unknown>;
    for (const nome of Object.getOwnPropertyNames(prototipo)) {
      const handler = prototipo[nome];
      if (nome === 'constructor' || typeof handler !== 'function') continue;
      const caminho = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (caminho === undefined) continue;
      const metodo = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      const url = `/${base}/${caminho}`
        .replace(/\/+/g, '/')
        .replace(/\/$/, '')
        .replace(/:\w+/g, gerarUuidV7());
      rotas.push({
        nome: `${metodo} /${base}/${caminho} (${controller.name}.${nome})`,
        metodo: metodo as RotaDescoberta['metodo'],
        url,
        ...declaracaoDeAcesso(refletor, [handler as () => unknown, controller]),
      });
    }
  }
  return rotas;
}

const rotas = descobrirRotas();
let api: NestFastifyApplication;
const tokens = new Map<CodigoPerfil | 'sem-perfil', string>();

beforeAll(async () => {
  api = await criarApi(opcoes);
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  const agora = new SystemClock().agora();
  for (const perfil of [...(Object.keys(PERFIS_PADRAO) as CodigoPerfil[]), 'sem-perfil'] as const) {
    const usuarioId = gerarUuidV7();
    if (perfil !== 'sem-perfil') perfis.atribuir(usuarioId, perfil);
    const token = randomBytes(32).toString('base64url');
    await sessoes.gravar(token, {
      id: gerarUuidV7(),
      usuarioId,
      tenantId: TENANT,
      nivel: 'completo',
      segundoFatorAtivo: true,
      criadaEm: agora,
      ultimoUso: agora,
    });
    tokens.set(perfil, token);
  }
});

afterAll(async () => {
  await api.close();
});

describe('toda rota declara o acesso (HU07)', () => {
  it('descobre as rotas dos controllers', () => {
    expect(rotas.length).toBeGreaterThan(10);
  });

  it.each(rotas.map((r) => [r.nome, r] as const))(
    '%s tem @Publico, @PermiteSessaoParcial ou @RequerPermissao',
    (_nome, rota) => {
      const declaracoes = [rota.publica, rota.parcial, rota.permissoes !== undefined].filter(
        Boolean,
      );
      expect(declaracoes).toHaveLength(1);
    },
  );
});

describe('matriz endpoint × perfil (HU07)', () => {
  const protegidas = rotas.filter((r) => r.permissoes !== undefined);
  const casos = protegidas.flatMap((rota) =>
    [...(Object.keys(PERFIS_PADRAO) as CodigoPerfil[]), 'sem-perfil' as const].map((perfil) => {
      const tem = new Set<string>(perfil === 'sem-perfil' ? [] : PERFIS_PADRAO[perfil]);
      return [rota.nome, perfil, concede(tem, rota.permissoes ?? []), rota] as const;
    }),
  );

  it.each(casos)('%s · %s · permitido=%s', async (_nome, perfil, permitido, rota) => {
    const resposta = await api.inject({
      method: rota.metodo,
      url: rota.url,
      headers: { authorization: `Bearer ${tokens.get(perfil) ?? ''}` },
      ...(rota.metodo === 'GET' || rota.metodo === 'DELETE' ? {} : { payload: {} }),
    });
    if (permitido) expect(resposta.statusCode).not.toBe(403);
    else expect(resposta.statusCode).toBe(403);
  });
});
