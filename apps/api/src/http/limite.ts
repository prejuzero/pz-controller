import { HttpException, HttpStatus, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { gerarUuidV7 } from '@pz/kernel';
import { criarLogger } from '@pz/observability';

import { JANELA_DE_REQUISICOES } from '../fichas.js';

import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';

const CHAVE_LIMITE = 'pz:limite-por-ip';
const logger = criarLogger('api.limite');

export interface LimitePorIp {
  readonly maximo: number;
  readonly janelaMs: number;
}

/** Rate limit por IP numa janela deslizante (CLAUDE.md, seção 14: rotas públicas com limite). */
export const LimitarPorIp = (maximo: number, janelaMs = 60_000): MethodDecorator =>
  SetMetadata(CHAVE_LIMITE, { maximo, janelaMs } satisfies LimitePorIp);

/** Conta requisições por chave numa janela deslizante; compartilhada entre instâncias. */
export interface JanelaDeRequisicoes {
  /** Registra a requisição e devolve quantas houve na janela (incluindo esta). */
  registrar(chave: string, janelaMs: number): Promise<number>;
}

/** Janela deslizante atômica no Redis, com o relógio do próprio Redis (igual entre instâncias). */
const SCRIPT_JANELA = `
local t = redis.call('TIME')
local agora = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, agora - tonumber(ARGV[1]))
redis.call('ZADD', KEYS[1], agora, ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return redis.call('ZCARD', KEYS[1])
`;

export class JanelaRedis implements JanelaDeRequisicoes {
  constructor(private readonly redis: Redis) {}

  async registrar(chave: string, janelaMs: number): Promise<number> {
    return Number(await this.redis.eval(SCRIPT_JANELA, 1, chave, janelaMs, gerarUuidV7()));
  }
}

export class JanelaEmMemoria implements JanelaDeRequisicoes {
  readonly #marcas = new Map<string, number[]>();

  registrar(chave: string, janelaMs: number): Promise<number> {
    const agora = performance.now();
    const marcas = (this.#marcas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
    marcas.push(agora);
    this.#marcas.set(chave, marcas);
    return Promise.resolve(marcas.length);
  }
}

/**
 * Aplica o limite declarado com @LimitarPorIp antes da autenticação: além do limite, 429 com
 * Retry-After, sem tocar no caso de uso. Atrás do balanceador, o IP vem do X-Forwarded-For
 * (trustProxy).
 */
@Injectable()
export class GuardaDeLimite implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly refletor: Reflector,
    @Inject(JANELA_DE_REQUISICOES) private readonly janela: JanelaDeRequisicoes,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const limite = this.refletor.get<LimitePorIp | undefined>(CHAVE_LIMITE, contexto.getHandler());
    if (limite === undefined) return true;
    const http = contexto.switchToHttp();
    const requisicao = http.getRequest<FastifyRequest>();
    const rota = requisicao.routeOptions.url ?? requisicao.url;
    const total = await this.janela.registrar(
      `pz:limite:${rota}:${requisicao.ip}`,
      limite.janelaMs,
    );
    if (total <= limite.maximo) return true;
    logger.warn({ rota, ip: requisicao.ip, total }, 'limite de requisições por IP excedido');
    void http
      .getResponse<FastifyReply>()
      .header('retry-after', String(Math.ceil(limite.janelaMs / 1000)));
    throw new HttpException(
      'Muitas requisições. Tente de novo em instantes.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
