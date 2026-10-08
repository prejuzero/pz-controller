import type { ContadorDeUsoDeIa } from '@pz/ia';
import type { Redis } from 'ioredis';

/** Dois meses: a chave do mês corrente nunca expira antes de o mês virar. */
const VALIDADE_S = 62 * 24 * 3600;

const chave = (tenantId: string, tarefa: string, mes: string) =>
  `pz:ia:orcamento:${mes}:${tenantId}:${tarefa}`;

/**
 * Tokens de IA por tenant, tarefa e mês no Redis (HU58, ADR-016): compartilhado entre workers e
 * preservado no reinício, para o orçamento mensal não zerar. INCRBY é atômico entre instâncias.
 */
export class ContadorDeUsoDeIaRedis implements ContadorDeUsoDeIa {
  constructor(private readonly redis: Redis) {}

  async usoNoMes(tenantId: string, tarefa: string, mes: string): Promise<number> {
    const valor = await this.redis.get(chave(tenantId, tarefa, mes));
    if (valor === null) return 0;
    const tokens = Number(valor);
    // Valor corrompido não pode virar zero: liberaria o orçamento sem ninguém saber.
    if (!Number.isSafeInteger(tokens) || tokens < 0) {
      throw new Error(`orçamento de IA: contador inválido no Redis (tarefa ${tarefa})`);
    }
    return tokens;
  }

  async registrar(tenantId: string, tarefa: string, mes: string, tokens: number): Promise<void> {
    const k = chave(tenantId, tarefa, mes);
    await this.redis.multi().incrby(k, tokens).expire(k, VALIDADE_S).exec();
  }
}
