import { LocalDate } from '@pz/kernel';
import { describe, expect, it, vi } from 'vitest';

import { ESCRITORIO } from '../teste/ficticios.js';

import { CacheDeDiasNaoUteisRedis } from './cache-redis.js';

import type { DiaNaoUtil } from '../domain/dias-nao-uteis.js';
import type { Uuid } from '@pz/kernel';
import type { Redis } from 'ioredis';

// Dados FICTÍCIOS de teste.
const dia: DiaNaoUtil = {
  data: LocalDate.de(2030, 3, 10),
  tipo: 'feriado',
  motivo: 'FICTÍCIO',
  fonte: {
    origem: 'global',
    eventoId: '01a10e00-0000-7000-8000-00000000e001' as Uuid,
    atoNormativo: 'FICTÍCIO',
    urlAto: 'https://exemplo.invalid/ficticio',
  },
};
const calcular = () => Promise.resolve([dia]);
const fora = new Error('Redis fora');
const falhas = {
  mget: () => Promise.reject(fora),
  set: () => Promise.reject(fora),
  multi: () => ({ incr: () => ({ expire: vi.fn() }), exec: () => Promise.resolve(null) }),
};
const quebrado = falhas as unknown as Redis;

describe('cache Redis do calendário: falhas (HU13)', () => {
  it('Redis fora na leitura: calcula pelo banco e sinaliza a falha', async () => {
    const aoFalhar = vi.fn();
    const cache = new CacheDeDiasNaoUteisRedis(quebrado, aoFalhar, () => ESCRITORIO);
    expect(await cache.doAno({}, 2030, calcular)).toEqual([dia]);
    expect(aoFalhar).toHaveBeenCalledWith(fora);
  });

  it('Redis fora na gravação: devolve o cálculo e sinaliza a falha', async () => {
    const aoFalhar = vi.fn();
    const redis = { ...falhas, mget: () => Promise.resolve([null, null, null]) };
    const cache = new CacheDeDiasNaoUteisRedis(
      redis as unknown as Redis,
      aoFalhar,
      () => ESCRITORIO,
    );
    expect(await cache.doAno({}, 2030, calcular)).toEqual([dia]);
    expect(aoFalhar).toHaveBeenCalledWith(fora);
  });

  it('sem tenant no contexto: não usa o cache', async () => {
    const aoFalhar = vi.fn();
    const cache = new CacheDeDiasNaoUteisRedis(quebrado, aoFalhar, () => undefined);
    expect(await cache.doAno({}, 2030, calcular)).toEqual([dia]);
    expect(aoFalhar).not.toHaveBeenCalled();
  });

  it('invalidação não executada lança (o job tenta de novo e vai para a DLQ)', async () => {
    const cache = new CacheDeDiasNaoUteisRedis(quebrado, vi.fn(), () => ESCRITORIO);
    await expect(
      cache.invalidar({ origem: 'global', tenantId: ESCRITORIO, anos: [2030] }),
    ).rejects.toThrow('não executada');
    await expect(
      cache.invalidar({ origem: 'global', tenantId: ESCRITORIO, anos: [] }),
    ).resolves.toBeUndefined();
  });
});
