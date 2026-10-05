import { Controller, Get, Post, Query } from '@nestjs/common';
import { carregarAmbiente } from '@pz/config/env';
import { ConsultaPaginada, documentoOpenApi, Problema, SituacaoDaApi } from '@pz/contracts';
import { Conflito, FixedClock, Instant, NaoEncontrado, RegraDeNegocio } from '@pz/kernel';
import { obterContexto } from '@pz/observability';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { esquemaApi } from './ambiente.js';
import { criarApi } from './app.js';
import { Publico } from './http/acesso.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { VerificadorDeDependencia } from '@pz/saude';

@Controller('v1/teste')
class ControllerDeTeste {
  @Get('nao-encontrado')
  @Publico()
  naoEncontrado(): never {
    throw new NaoEncontrado('prazo.nao-encontrado', 'Prazo não encontrado.');
  }

  @Get('conflito')
  @Publico()
  conflito(): never {
    throw new Conflito('prazo.ja-confirmado', 'O prazo já foi confirmado.');
  }

  @Get('regra')
  @Publico()
  regra(): never {
    throw new RegraDeNegocio('prazo.sem-regra-legal', 'Sem regra legal cadastrada para este ato.');
  }

  @Get('inesperado')
  @Publico()
  inesperado(): never {
    throw new Error('detalhe interno com CPF 123.456.789-09 que não pode vazar');
  }

  @Get('pagina')
  @Publico()
  pagina(@Query({ schema: ConsultaPaginada }) consulta: z.output<typeof ConsultaPaginada>) {
    return { ...consulta, requestId: obterContexto().requestId };
  }

  @Post('privada')
  privada(): string {
    return 'não deveria chegar aqui';
  }
}

const ambiente = carregarAmbiente(esquemaApi, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://pz_dev:pz_dev_local@127.0.0.1:5432/prejuzero',
  REDIS_URL: 'redis://127.0.0.1:6379',
  S3_REGION: 'us-east-1',
  VERSAO: 'abc123',
});
const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));

let api: NestFastifyApplication | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

async function subir(
  verificadores: VerificadorDeDependencia[] = [],
  opcoes: { producao?: boolean } = {},
): Promise<NestFastifyApplication> {
  api = await criarApi({
    ambiente: opcoes.producao === true ? { ...ambiente, NODE_ENV: 'production' } : ambiente,
    relogio,
    verificadores,
    controllersExtras: [ControllerDeTeste],
  });
  await api.init();
  await api.getHttpAdapter().getInstance().ready();
  return api;
}

const disponivel = { nome: 'banco', verificar: () => Promise.resolve() };
const indisponivel = { nome: 'redis', verificar: () => Promise.reject(new Error('ECONNREFUSED')) };

describe('api: saúde e sondas', () => {
  it('GET /v1/saude responde conforme o contrato', async () => {
    const resposta = await (await subir([disponivel])).inject({ method: 'GET', url: '/v1/saude' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['cache-control']).toBe('no-store');
    expect(SituacaoDaApi.esquema.parse(resposta.json())).toEqual({
      situacao: 'operacional',
      versao: 'abc123',
      verificadoEm: '2026-10-05T12:00:00.000Z',
    });
  });

  it('/health/live responde sempre; /health/ready responde 503 com dependência fora', async () => {
    const app = await subir([disponivel, indisponivel]);

    expect((await app.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
    const pronto = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(pronto.statusCode).toBe(503);
    expect(pronto.json()).toEqual({
      situacao: 'degradada',
      dependencias: [
        { dependencia: 'banco', disponivel: true, latenciaMs: 0 },
        { dependencia: 'redis', disponivel: false, latenciaMs: 0 },
      ],
    });
  });

  it('/health/ready responde 200 com tudo disponível', async () => {
    const pronto = await (
      await subir([disponivel])
    ).inject({ method: 'GET', url: '/health/ready' });
    expect(pronto.statusCode).toBe(200);
  });
});

describe('api: verificadores do ambiente', () => {
  it('sem substituição, confere banco, Redis e (se configurado) o armazenamento', async () => {
    const semServicos = {
      DATABASE_URL: 'postgresql://u:s@127.0.0.1:1/db',
      REDIS_URL: 'redis://127.0.0.1:1',
    };
    for (const extra of [{}, { S3_ENDPOINT: 'http://127.0.0.1:1' }]) {
      api = await criarApi({ ambiente: { ...ambiente, ...semServicos, ...extra }, relogio });
      await api.init();
      const pronto = (await api.inject({ method: 'GET', url: '/health/ready' })).json<{
        dependencias: { dependencia: string }[];
      }>();
      expect(pronto.dependencias.map((item) => item.dependencia)).toEqual(
        'S3_ENDPOINT' in extra ? ['banco', 'redis', 'armazenamento'] : ['banco', 'redis'],
      );
      await api.close();
      api = undefined;
    }
  });
});

describe('api: contrato e documentação', () => {
  it('serve o mesmo OpenAPI gerado em packages/contracts', async () => {
    const resposta = await (await subir()).inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(resposta.json()).toEqual(documentoOpenApi());
  });

  it('a documentação interativa existe fora de produção e some em produção', async () => {
    const desenvolvimento = await (await subir()).inject({ method: 'GET', url: '/v1/docs' });
    expect(desenvolvimento.statusCode).toBe(200);
    expect(desenvolvimento.body).toContain('integrity="sha384-');
    await api?.close();

    const producao = await (
      await subir([], { producao: true })
    ).inject({ method: 'GET', url: '/v1/docs' });
    expect(producao.statusCode).toBe(404);
  });
});

describe('api: erros em problem+json (RFC 9457)', () => {
  const casos = [
    ['/v1/teste/nao-encontrado', 404, 'prazo.nao-encontrado'],
    ['/v1/teste/conflito', 409, 'prazo.ja-confirmado'],
    ['/v1/teste/regra', 422, 'prazo.sem-regra-legal'],
    ['/v1/inexistente', 404, 'rota.nao-encontrada'],
  ] as const;

  it.each(casos)('%s → %i (%s)', async (url, status, codigo) => {
    const resposta = await (await subir()).inject({ method: 'GET', url });

    expect(resposta.statusCode).toBe(status);
    expect(resposta.headers['content-type']).toContain('application/problem+json');
    expect(Problema.parse(resposta.json())).toMatchObject({ status, codigo });
  });

  it('erro inesperado vira 500 sem vazar detalhes internos', async () => {
    const resposta = await (await subir()).inject({ method: 'GET', url: '/v1/teste/inesperado' });

    expect(resposta.statusCode).toBe(500);
    expect(Problema.parse(resposta.json())).toMatchObject({
      status: 500,
      codigo: 'erro.inesperado',
    });
    expect(resposta.body).not.toContain('detalhe interno');
    expect(resposta.body).not.toContain('123.456.789-09');
  });

  it('entrada inválida vira 400 com os problemas por campo', async () => {
    const resposta = await (
      await subir()
    ).inject({ method: 'GET', url: '/v1/teste/pagina?limite=500' });

    expect(resposta.statusCode).toBe(400);
    expect(Problema.parse(resposta.json())).toMatchObject({
      codigo: 'validacao',
      problemas: [{ campo: 'limite', mensagem: expect.any(String) as string }],
    });
  });

  it('rota sem @Publico() nega acesso por padrão (401)', async () => {
    const resposta = await (await subir()).inject({ method: 'POST', url: '/v1/teste/privada' });

    expect(resposta.statusCode).toBe(401);
    expect(Problema.parse(resposta.json()).codigo).toBe('autenticacao.necessaria');
  });
});

describe('api: correlação', () => {
  it('gera x-request-id, o expõe na resposta e no contexto da requisição', async () => {
    const resposta = await (await subir()).inject({ method: 'GET', url: '/v1/teste/pagina' });
    const requestId = resposta.headers['x-request-id'];

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(resposta.json()).toEqual({ limite: 20, requestId });
  });

  it('reaproveita um x-request-id válido e troca um inválido', async () => {
    const app = await subir();
    const valido = await app.inject({
      method: 'GET',
      url: '/v1/teste/pagina',
      headers: { 'x-request-id': 'balanceador-123' },
    });
    const invalido = await app.inject({
      method: 'GET',
      url: '/v1/teste/pagina',
      headers: { 'x-request-id': '<script>' },
    });

    expect(valido.headers['x-request-id']).toBe('balanceador-123');
    expect(invalido.headers['x-request-id']).not.toBe('<script>');
    expect(
      Problema.parse(
        (
          await app.inject({
            method: 'GET',
            url: '/v1/teste/nao-encontrado',
            headers: { 'x-request-id': 'balanceador-456' },
          })
        ).json(),
      ).requestId,
    ).toBe('balanceador-456');
  });
});
