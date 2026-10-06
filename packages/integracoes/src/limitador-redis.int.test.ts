import { RedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LimitadorRedis } from './limitador-redis.js';

import type { StartedRedisContainer } from '@testcontainers/redis';

let conteiner: StartedRedisContainer;
const conexoes: Redis[] = [];

function instancia(): LimitadorRedis {
  const redis = new Redis(conteiner.getConnectionUrl());
  conexoes.push(redis);
  return new LimitadorRedis(redis);
}

beforeAll(async () => {
  conteiner = await new RedisContainer('redis:8.6.7-alpine').start();
}, 300_000);

afterAll(async () => {
  await Promise.all(conexoes.map((conexao) => conexao.quit()));
  await conteiner.stop();
});

describe('rate limit distribuído no Redis (HU09)', () => {
  it('a cota é compartilhada entre instâncias', async () => {
    // 600/min = 10/s com 10 fichas: 15 chamadas divididas entre 2 instâncias levam ~500 ms.
    const [a, b] = [instancia(), instancia()];
    const inicio = performance.now();
    await Promise.all(
      Array.from({ length: 15 }, (_, i) => (i % 2 === 0 ? a : b).aguardarVez('djen', 600)),
    );
    const decorrido = performance.now() - inicio;
    expect(decorrido).toBeGreaterThanOrEqual(400);
    expect(decorrido).toBeLessThan(3_000);
  });

  it('cada adaptador tem o próprio balde', async () => {
    const limitador = instancia();
    for (let i = 0; i < 10; i++) await limitador.aguardarVez('s3', 600);
    const inicio = performance.now();
    await limitador.aguardarVez('ses', 600);
    expect(performance.now() - inicio).toBeLessThan(100);
  });
});
