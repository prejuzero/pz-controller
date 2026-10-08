import { RedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ContadorDeUsoDeIaRedis } from './contador-uso-ia-redis.js';

import type { StartedRedisContainer } from '@testcontainers/redis';

const TENANT = '01a10e00-0000-7000-8000-0000000000a1';
const OUTRO_TENANT = '01a10e00-0000-7000-8000-0000000000a2';

let conteiner: StartedRedisContainer;
let redis: Redis;

beforeAll(async () => {
  conteiner = await new RedisContainer('redis:8.6.7-alpine').start();
  redis = new Redis(conteiner.getConnectionUrl());
}, 300_000);

afterAll(async () => {
  redis.disconnect();
  await conteiner.stop();
});

describe('ContadorDeUsoDeIaRedis', () => {
  it('acumula por tenant, tarefa e mês e sobrevive a uma nova instância (reinício do worker)', async () => {
    const contador = new ContadorDeUsoDeIaRedis(redis);
    await contador.registrar(TENANT, 'classificacao', '2030-01', 100);
    await contador.registrar(TENANT, 'classificacao', '2030-01', 50);
    await contador.registrar(TENANT, 'resumo', '2030-01', 7);
    await contador.registrar(TENANT, 'classificacao', '2030-02', 3);
    await contador.registrar(OUTRO_TENANT, 'classificacao', '2030-01', 9);

    const reiniciado = new ContadorDeUsoDeIaRedis(redis);
    expect(await reiniciado.usoNoMes(TENANT, 'classificacao', '2030-01')).toBe(150);
    expect(await reiniciado.usoNoMes(TENANT, 'resumo', '2030-01')).toBe(7);
    expect(await reiniciado.usoNoMes(TENANT, 'classificacao', '2030-02')).toBe(3);
    expect(await reiniciado.usoNoMes(OUTRO_TENANT, 'classificacao', '2030-01')).toBe(9);
    expect(await reiniciado.usoNoMes(OUTRO_TENANT, 'resumo', '2030-01')).toBe(0);
  });

  it('é atômico entre workers concorrentes', async () => {
    const a = new ContadorDeUsoDeIaRedis(redis);
    const b = new ContadorDeUsoDeIaRedis(redis);
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        (i % 2 === 0 ? a : b).registrar(TENANT, 'concorrencia', '2030-03', 2),
      ),
    );
    expect(await a.usoNoMes(TENANT, 'concorrencia', '2030-03')).toBe(100);
  });

  it('expira a chave depois do mês (o Redis não acumula meses antigos)', async () => {
    const contador = new ContadorDeUsoDeIaRedis(redis);
    await contador.registrar(TENANT, 'expira', '2030-04', 1);
    const [chave] = await redis.keys('pz:ia:orcamento:*expira*');
    expect(chave).toBeDefined();
    const ttl = await redis.ttl(chave ?? '');
    expect(ttl).toBeGreaterThan(31 * 24 * 3600);
    expect(ttl).toBeLessThanOrEqual(62 * 24 * 3600);
  });

  it('lança se o valor gravado estiver corrompido (nunca libera o orçamento em silêncio)', async () => {
    const contador = new ContadorDeUsoDeIaRedis(redis);
    await contador.registrar(TENANT, 'corrompido', '2030-05', 1);
    const [chave] = await redis.keys('pz:ia:orcamento:*corrompido*');
    await redis.set(chave ?? '', 'abc');
    await expect(contador.usoNoMes(TENANT, 'corrompido', '2030-05')).rejects.toThrow(
      /orçamento de IA/,
    );
  });
});
