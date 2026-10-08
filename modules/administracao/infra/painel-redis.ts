import { Instant } from '@pz/kernel';
import { z } from 'zod';

import type { ArmazemDoPainel } from '../application/painel.js';
import type { FalhaDeIntegracao, Retrato } from '../domain/integracoes.js';
import type { Redis } from 'ioredis';

const CHAVE_RETRATOS = 'pz:admin:integracoes';
const CHAVE_FALHAS = 'pz:admin:integracoes:falhas';
const TAMANHO_DO_HISTORICO = 100;
/** Retrato de instância que sumiu há mais de um dia é apagado na próxima gravação. */
const DESCARTE_MS = 24 * 3600_000;

const instante = z.iso.datetime().transform((iso) => Instant.deIso(iso));
const Situacao = z.object({
  adaptador: z.string(),
  estado: z.enum(['operacional', 'degradado', 'indisponivel']),
  ultimoSucesso: instante.optional(),
  ultimaFalha: instante.optional(),
  erro: z.string().optional(),
});
const RetratoGravado = z.object({
  instancia: z.string(),
  em: instante,
  situacoes: z.array(Situacao),
});
const FalhaGravada = z.object({
  adaptador: z.string(),
  instancia: z.string(),
  em: instante,
  erro: z.string(),
});

const iso = (i: Instant | undefined) => i?.paraIso();

const serializar = (r: Retrato) =>
  JSON.stringify({
    instancia: r.instancia,
    em: r.em.paraIso(),
    situacoes: r.situacoes.map((s) => ({
      ...s,
      ultimoSucesso: iso(s.ultimoSucesso),
      ultimaFalha: iso(s.ultimaFalha),
    })),
  });

/** Dado vem do Redis: valida e lança se estiver corrompido (nunca some em silêncio). */
function lerTodos<T>(textos: readonly string[], esquema: z.ZodType<T>): T[] {
  return textos.flatMap((texto) => {
    const r = esquema.safeParse(JSON.parse(texto));
    if (!r.success) throw new Error('painel de integrações: registro inválido no Redis');
    return [r.data];
  });
}

/** Retratos (hash por instância) e histórico curto de falhas (lista limitada) no Redis. */
export class PainelRedis implements ArmazemDoPainel {
  constructor(private readonly redis: Redis) {}

  async retratos(): Promise<Retrato[]> {
    const valores = Object.values(await this.redis.hgetall(CHAVE_RETRATOS));
    return lerTodos(valores, RetratoGravado) as Retrato[];
  }

  async gravar(retrato: Retrato, falhas: readonly FalhaDeIntegracao[]): Promise<void> {
    const antigos = (await this.retratos())
      .filter((r) => retrato.em.epochMs - r.em.epochMs > DESCARTE_MS)
      .map((r) => r.instancia);
    const transacao = this.redis
      .multi()
      .hset(CHAVE_RETRATOS, retrato.instancia, serializar(retrato));
    if (antigos.length > 0) transacao.hdel(CHAVE_RETRATOS, ...antigos);
    if (falhas.length > 0) {
      transacao
        .lpush(CHAVE_FALHAS, ...falhas.map((f) => JSON.stringify({ ...f, em: f.em.paraIso() })))
        .ltrim(CHAVE_FALHAS, 0, TAMANHO_DO_HISTORICO - 1);
    }
    await transacao.exec();
  }

  async falhas(limite: number): Promise<FalhaDeIntegracao[]> {
    return lerTodos(await this.redis.lrange(CHAVE_FALHAS, 0, limite - 1), FalhaGravada);
  }
}
