import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';
import { carregarAmbiente } from '@pz/config/env';
import { Banco, executarNoTenant, OutboxPostgres } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { gerarUuidV7, SystemClock } from '@pz/kernel';
import { executarComContexto, iniciarTelemetria } from '@pz/observability';
import { HistoricoEmMemoria } from '@pz/saude';
import { RedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { esquemaWorker } from '../ambiente.js';
import { criarWorker } from '../worker.js';

import type { INestApplicationContext } from '@nestjs/common';
import type { BancoDeTeste } from '@pz/db/teste';
import type { EventoDominio, Uuid } from '@pz/kernel';
import type { Telemetria } from '@pz/observability';
import type { StartedRedisContainer } from '@testcontainers/redis';

// Dados fictícios de teste.
const TENANT = '01a10e00-0000-7000-8000-0000000e2e01' as Uuid;

let postgres: BancoDeTeste;
let redis: StartedRedisContainer;
let worker: INestApplicationContext;
let banco: Banco;
let telemetria: Telemetria;
const spans = new InMemorySpanExporter();

async function esperar(
  condicao: () => boolean | Promise<boolean>,
  limiteMs = 20_000,
): Promise<void> {
  const limite = performance.now() + limiteMs;
  while (!(await condicao())) {
    if (performance.now() > limite) throw new Error('condição não atingida a tempo');
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
}

beforeAll(async () => {
  [postgres, redis] = await Promise.all([
    subirBancoDeTeste(),
    new RedisContainer('redis:8.6.7-alpine').start(),
  ]);
  await postgres.migrar();
  const sistema = await postgres.conectar('pz_sistema');
  await sistema.query(
    `INSERT INTO tenant (id, nome, tipo) VALUES ($1, 'Escritório E2E', 'escritorio')`,
    [TENANT],
  );
  await sistema.end();

  telemetria = iniciarTelemetria({
    servico: 'pz-worker-teste',
    versao: 't',
    ambiente: 'test',
    exportadorDeSpans: spans,
  });
  const ambiente = carregarAmbiente(esquemaWorker, {
    NODE_ENV: 'test',
    DATABASE_URL: postgres.url('pz_app'),
    DATABASE_URL_SISTEMA: postgres.url('pz_sistema'),
    REDIS_URL: redis.getConnectionUrl(),
    S3_REGION: 'us-east-1',
    RELAY_INTERVALO_MS: '100',
  });
  worker = await criarWorker({ ambiente });
  await worker.init();
  banco = new Banco({ url: postgres.url('pz_app') });
}, 300_000);

afterAll(async () => {
  await worker.close();
  await banco.encerrar();
  await telemetria.encerrar();
  await Promise.all([postgres.parar(), redis.stop()]);
});

describe('relay do outbox → fila → consumidor (HU10, ponta a ponta)', () => {
  it('o evento gravado numa requisição chega ao consumidor em < 2 s, uma vez, no mesmo trace', async () => {
    const evento: EventoDominio = {
      id: gerarUuidV7(),
      tipo: 'SituacaoVerificada',
      versao: 1,
      tenantId: TENANT,
      agregadoId: 'verificacao-e2e',
      ocorridoEm: new SystemClock().agora(),
      payload: { situacao: 'operacional' },
    };

    // "Requisição HTTP": span de origem + correlação + tenant; o caso de uso grava no outbox.
    const inicio = performance.now();
    const traceId = await trace
      .getTracer('teste')
      .startActiveSpan('POST /v1/exemplo', async (span) => {
        await executarComContexto({ requestId: 'req-e2e' }, () =>
          executarNoTenant(TENANT, () =>
            banco.executar((tx) => new OutboxPostgres().gravar(tx, [evento])),
          ),
        );
        span.end();
        return span.spanContext().traceId;
      });

    const historico = worker.get(HistoricoEmMemoria);
    await esperar(() => historico.entradas().length === 1);
    const latenciaMs = performance.now() - inicio;

    expect(historico.entradas()).toEqual([
      expect.objectContaining({ eventoId: evento.id, tenantId: TENANT, situacao: 'operacional' }),
    ]);
    expect(latenciaMs).toBeLessThan(2_000);

    // Um único trace: o consumo do job continua o trace da requisição de origem.
    await esperar(() => spans.getFinishedSpans().some((s) => s.name === 'eventos process'));
    const consumo = spans.getFinishedSpans().find((s) => s.name === 'eventos process');
    expect(consumo?.spanContext().traceId).toBe(traceId);
    expect(consumo?.attributes).toMatchObject({ 'pz.tenant.id': TENANT });

    // Marcado como publicado e registrado como processado (uma vez).
    const verificacao = await postgres.conectar('pz_sistema');
    const { rows } = await verificacao.query<{ publicado: boolean; processados: number }>(
      `SELECT publicado_em IS NOT NULL AS publicado,
              (SELECT count(*)::int FROM evento_processado WHERE evento_id = $1) AS processados
         FROM evento_dominio WHERE id = $1`,
      [evento.id],
    );
    await verificacao.end();
    expect(rows[0]).toEqual({ publicado: true, processados: 1 });
  }, 60_000);
});
