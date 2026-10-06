import { LimitadorBase } from './limitador.js';

import type { Tentativa } from './limitador.js';

/** O mínimo do cliente Redis (ioredis) que o limitador usa: sem depender do SDK aqui. */
export interface ClienteRedisComScript {
  eval(
    script: string,
    numeroDeChaves: number,
    ...argumentos: (string | number)[]
  ): Promise<unknown>;
}

/**
 * Token bucket atômico no Redis. O instante vem do próprio Redis (`TIME`): instâncias com
 * relógios diferentes compartilham o mesmo balde sem distorcer a cota.
 */
const SCRIPT_BALDE = `
local capacidade = tonumber(ARGV[1])
local porMs = tonumber(ARGV[2])
local t = redis.call('TIME')
local agora = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local estado = redis.call('HMGET', KEYS[1], 'fichas', 'em')
local fichas = tonumber(estado[1]) or capacidade
local em = tonumber(estado[2]) or agora
fichas = math.min(capacidade, fichas + (agora - em) * porMs)
local espera = 0
if fichas >= 1 then
  fichas = fichas - 1
else
  espera = math.ceil((1 - fichas) / porMs)
end
redis.call('HSET', KEYS[1], 'fichas', tostring(fichas), 'em', tostring(agora))
redis.call('PEXPIRE', KEYS[1], math.ceil(capacidade / porMs) + 1000)
return espera
`;

export class LimitadorRedis extends LimitadorBase {
  constructor(
    private readonly redis: ClienteRedisComScript,
    opcoes: { readonly esperaMaximaMs?: number; readonly prefixo?: string } = {},
  ) {
    super(opcoes.esperaMaximaMs ?? 30_000);
    this.#prefixo = opcoes.prefixo ?? 'pz:limite:';
  }

  readonly #prefixo: string;

  protected tentar: Tentativa = async (chave, capacidade, fichasPorMs) =>
    Number(
      await this.redis.eval(SCRIPT_BALDE, 1, `${this.#prefixo}${chave}`, capacidade, fichasPorMs),
    );
}
