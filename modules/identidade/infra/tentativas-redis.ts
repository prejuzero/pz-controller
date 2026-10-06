import { Instant } from '@pz/kernel';

import { JANELA_DE_FALHAS_MS } from '../domain/bloqueio.js';

import type { ControleDeTentativas } from '../application/portas.js';
import type { Redis } from 'ioredis';

/** Falhas e bloqueios no Redis, compartilhados por todas as instâncias da api. */
export class TentativasRedis implements ControleDeTentativas {
  constructor(
    private readonly redis: Redis,
    private readonly prefixo = 'pz:tentativas:',
  ) {}

  async bloqueadoAte(chave: string): Promise<Instant | undefined> {
    const valor = await this.redis.get(`${this.prefixo}bloqueio:${chave}`);
    return valor === null ? undefined : Instant.deEpochMs(Number(valor));
  }

  async registrarFalha(chave: string): Promise<number> {
    const contador = `${this.prefixo}falhas:${chave}`;
    const [[, falhas] = [null, 0]] = (await this.redis
      .multi()
      .incr(contador)
      .pexpire(contador, JANELA_DE_FALHAS_MS, 'NX')
      .exec()) ?? [[null, 0]];
    return Number(falhas);
  }

  async bloquear(chave: string, ate: Instant): Promise<void> {
    await this.redis.set(
      `${this.prefixo}bloqueio:${chave}`,
      String(ate.epochMs),
      'PXAT',
      ate.epochMs,
    );
  }

  async limpar(chave: string): Promise<void> {
    await this.redis.del(`${this.prefixo}falhas:${chave}`, `${this.prefixo}bloqueio:${chave}`);
  }
}
