import { LocalDate } from '@pz/kernel';
import { RedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ESCRITORIO, OUTRO_ESCRITORIO } from '../teste/ficticios.js';

import { CacheDeDiasNaoUteisRedis } from './cache-redis.js';

import type { DiaNaoUtil } from '../domain/dias-nao-uteis.js';
import type { Uuid } from '@pz/kernel';
import type { StartedRedisContainer } from '@testcontainers/redis';

// Dados FICTÍCIOS de teste: um ano com um dia não útil por semana.
const ano = 2030;
const dias: DiaNaoUtil[] = Array.from({ length: 52 }, (_, i) => ({
  data: LocalDate.de(ano, 1, 1).maisDias(i * 7),
  tipo: 'feriado',
  motivo: `FICTÍCIO ${String(i)}`,
  fonte: {
    origem: 'global',
    eventoId: '01a10e00-0000-7000-8000-00000000e001' as Uuid,
    atoNormativo: 'FICTÍCIO: Lei de Teste, art. 1º',
    urlAto: 'https://exemplo.invalid/ficticio',
  },
}));
const jurisdicao = { uf: 'XA', tribunal: 'TJXA', comarca: 'Alfa' };

let conteiner: StartedRedisContainer;
let redis: Redis;
let tenant: Uuid = ESCRITORIO;
let cache: CacheDeDiasNaoUteisRedis;

function contador() {
  const calcular = vi.fn(() => Promise.resolve(dias));
  return { calcular, ler: () => cache.doAno(jurisdicao, ano, calcular) };
}

beforeAll(async () => {
  conteiner = await new RedisContainer('redis:8.6.7-alpine').start();
  redis = new Redis(conteiner.getConnectionUrl());
  cache = new CacheDeDiasNaoUteisRedis(
    redis,
    (erro) => {
      throw erro;
    },
    () => tenant,
  );
}, 300_000);

afterAll(async () => {
  await redis.quit();
  await conteiner.stop();
});

describe('cache Redis de diasNaoUteis por (jurisdição, ano) (HU13)', () => {
  it('primeira leitura calcula; as seguintes vêm do cache, iguais ao cálculo', async () => {
    const { calcular, ler } = contador();
    expect(await ler()).toEqual(dias);
    expect(await ler()).toEqual(dias);
    expect(calcular).toHaveBeenCalledTimes(1);
  });

  it('consulta de um ano com cache em menos de 5 ms (aceite técnico)', async () => {
    const { ler } = contador();
    await ler();
    const tempos: number[] = [];
    for (let i = 0; i < 200; i++) {
      const inicio = performance.now();
      await ler();
      tempos.push(performance.now() - inicio);
    }
    tempos.sort((a, b) => a - b);
    expect(tempos[Math.floor(tempos.length * 0.95)]).toBeLessThan(5);
  });

  it('alteração global invalida todos os tenants; local, só o próprio', async () => {
    await redis.flushall();
    tenant = OUTRO_ESCRITORIO;
    const outro = contador();
    await outro.ler();
    tenant = ESCRITORIO;
    const meu = contador();
    await meu.ler();

    await cache.invalidar({ origem: 'local', tenantId: OUTRO_ESCRITORIO, anos: [ano] });
    await meu.ler();
    expect(meu.calcular).toHaveBeenCalledTimes(1);
    tenant = OUTRO_ESCRITORIO;
    await outro.ler();
    expect(outro.calcular).toHaveBeenCalledTimes(2);

    await cache.invalidar({ origem: 'global', tenantId: OUTRO_ESCRITORIO, anos: [ano + 1] });
    await outro.ler();
    expect(outro.calcular).toHaveBeenCalledTimes(2);
    await cache.invalidar({ origem: 'global', tenantId: OUTRO_ESCRITORIO, anos: [ano] });
    tenant = ESCRITORIO;
    await meu.ler();
    expect(meu.calcular).toHaveBeenCalledTimes(2);
  });

  it('alteração durante o cálculo: o resultado velho não fica valendo', async () => {
    tenant = ESCRITORIO;
    await cache.invalidar({ origem: 'global', tenantId: ESCRITORIO, anos: [ano] });
    const velho = vi.fn(async () => {
      await cache.invalidar({ origem: 'global', tenantId: ESCRITORIO, anos: [ano] });
      return dias.slice(1);
    });
    expect(await cache.doAno(jurisdicao, ano, velho)).toHaveLength(dias.length - 1);
    const { calcular, ler } = contador();
    expect(await ler()).toEqual(dias);
    expect(calcular).toHaveBeenCalledTimes(1);
  });

  it('jurisdições diferentes não se misturam', async () => {
    const calcular = vi.fn(() => Promise.resolve([]));
    expect(await cache.doAno({ ...jurisdicao, comarca: 'Beta' }, ano, calcular)).toEqual([]);
    expect(calcular).toHaveBeenCalledTimes(1);
  });
});
