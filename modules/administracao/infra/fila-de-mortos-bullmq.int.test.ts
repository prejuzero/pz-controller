import { Instant } from '@pz/kernel';
import { RedisContainer } from '@testcontainers/redis';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FilaDeMortosBullMq } from './fila-de-mortos-bullmq.js';
import { PainelRedis } from './painel-redis.js';

import type { StartedRedisContainer } from '@testcontainers/redis';
import type { ConnectionOptions } from 'bullmq';

let conteiner: StartedRedisContainer;
let conexao: ConnectionOptions;
let mortos: FilaDeMortosBullMq;

beforeAll(async () => {
  conteiner = await new RedisContainer('redis:8.6.7-alpine').start();
  conexao = { url: conteiner.getConnectionUrl() };
  mortos = new FilaDeMortosBullMq(conexao);
}, 300_000);

afterAll(async () => {
  await mortos.fechar();
  await conteiner.stop();
});

/** Reproduz o que o worker faz (runtime.ts): o job falha de vez e uma cópia vai para a DLQ. */
async function matar(jobId: string): Promise<void> {
  const fila = new Queue('notificacoes', { connection: conexao });
  const dlq = new Queue('notificacoes-dlq', { connection: conexao });
  const worker = new Worker('notificacoes', () => Promise.reject(new Error('SMTP fora do ar')), {
    connection: conexao,
  });
  const falhou = new Promise<void>((pronto) =>
    worker.on('failed', () => {
      pronto();
    }),
  );
  await fila.add('notificacao.email', { escopo: 'teste' }, { jobId, attempts: 1 });
  await falhou;
  await worker.close();
  await dlq.add(
    'morto',
    {
      fila: 'notificacoes',
      jobId,
      tipo: 'notificacao.email',
      dados: { escopo: 'teste' },
      erro: 'SMTP fora do ar',
      tentativas: 1,
      falhouEm: '2026-10-06T12:00:00.000Z',
    },
    { jobId: `notificacoes-${jobId}`, removeOnComplete: false },
  );
  await Promise.all([fila.close(), dlq.close()]);
}

describe('DLQ no BullMQ (HU07)', () => {
  it('busca o morto e o devolve à fila de origem com tentativas zeradas, fora da DLQ', async () => {
    await matar('notificacao.email-1');
    const morto = await mortos.buscar('notificacoes', 'notificacao.email-1');
    expect(morto).toMatchObject({
      tipo: 'notificacao.email',
      erro: 'SMTP fora do ar',
      originalDisponivel: true,
    });
    if (morto === undefined) throw new Error('morto deveria existir');

    await mortos.reprocessar(morto);

    const fila = new Queue('notificacoes', { connection: conexao });
    const job = await fila.getJob('notificacao.email-1');
    expect(await job?.getState()).toBe('waiting');
    expect(job?.attemptsMade).toBe(0);
    expect(await mortos.buscar('notificacoes', 'notificacao.email-1')).toBeUndefined();
    await fila.close();
  });

  it('original apagado da fila: o morto aparece como indisponível', async () => {
    await matar('notificacao.email-2');
    const fila = new Queue('notificacoes', { connection: conexao });
    await fila.remove('notificacao.email-2');
    await fila.close();
    const morto = await mortos.buscar('notificacoes', 'notificacao.email-2');
    expect(morto?.originalDisponivel).toBe(false);
  });

  it('fila fora do catálogo não é consultada', async () => {
    expect(await mortos.buscar('inexistente', 'x')).toBeUndefined();
  });

  it('entrega ao painel as filas do catálogo e as DLQs', () => {
    const nomes = mortos.todas().map((fila) => fila.name);
    expect(nomes).toContain('notificacoes');
    expect(nomes).toContain('notificacoes-dlq');
  });
});

describe('painel do administrador no Redis (HU39)', () => {
  it('resumo por fila conta falhos e mortos da DLQ', async () => {
    await matar('job-do-resumo');
    const notificacoes = (await mortos.resumo()).find((r) => r.fila === 'notificacoes');
    expect(notificacoes?.falhos).toBeGreaterThanOrEqual(1);
    expect(notificacoes?.mortos).toBeGreaterThanOrEqual(1);
  });

  it('grava e lê retratos e falhas, validando o que vem do Redis', async () => {
    const redis = new Redis(conteiner.getConnectionUrl());
    try {
      const painel = new PainelRedis(redis);
      const em = Instant.deIso('2026-10-08T12:00:00Z');
      const retrato = {
        instancia: 'w1',
        em,
        situacoes: [
          { adaptador: 'smtp', estado: 'degradado' as const, ultimaFalha: em, erro: 'x' },
        ],
      };
      await painel.gravar(retrato, [{ adaptador: 'smtp', instancia: 'w1', em, erro: 'x' }]);
      expect(await painel.retratos()).toEqual([retrato]);
      expect(await painel.falhas(10)).toEqual([
        { adaptador: 'smtp', instancia: 'w1', em, erro: 'x' },
      ]);
      await redis.hset('pz:admin:integracoes', 'w9', '{"lixo":true}');
      await expect(painel.retratos()).rejects.toThrow('registro inválido');
    } finally {
      redis.disconnect();
    }
  });
});
