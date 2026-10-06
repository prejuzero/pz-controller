import { Instant } from '@pz/kernel';

import { hashDoToken } from './tokens.js';

import type { ArmazemDeSessoes } from '../application/portas.js';
import type { NivelSessao, Sessao } from '../domain/sessao.js';
import type { Uuid } from '@pz/kernel';
import type { Redis } from 'ioredis';

interface SessaoSerializada {
  id: string;
  usuarioId: string;
  tenantId: string;
  nivel: NivelSessao;
  criadaEm: number;
  ultimoUso: number;
}

/**
 * Sessões no Redis (HU06): chave = SHA-256 do token, TTL = expiração da sessão (o Redis apaga
 * sozinho). Um conjunto por usuário permite revogar todas as sessões dele de uma vez.
 */
export class SessoesRedis implements ArmazemDeSessoes {
  constructor(
    private readonly redis: Redis,
    private readonly prefixo = 'pz:sessao:',
  ) {}

  #chave(token: string): string {
    return `${this.prefixo}${hashDoToken(token)}`;
  }

  #doUsuario(usuarioId: string): string {
    return `${this.prefixo}usuario:${usuarioId}`;
  }

  async gravar(token: string, sessao: Sessao, expiraEm: Instant): Promise<void> {
    const ttlMs = Math.max(1, expiraEm.epochMs - sessao.ultimoUso.epochMs);
    const dados: SessaoSerializada = {
      id: sessao.id,
      usuarioId: sessao.usuarioId,
      tenantId: sessao.tenantId,
      nivel: sessao.nivel,
      criadaEm: sessao.criadaEm.epochMs,
      ultimoUso: sessao.ultimoUso.epochMs,
    };
    await this.redis
      .multi()
      .set(this.#chave(token), JSON.stringify(dados), 'PX', ttlMs)
      .sadd(this.#doUsuario(sessao.usuarioId), hashDoToken(token))
      .pexpire(this.#doUsuario(sessao.usuarioId), 7 * 24 * 3600 * 1000)
      .exec();
  }

  async obter(token: string): Promise<Sessao | undefined> {
    const bruto = await this.redis.get(this.#chave(token));
    if (bruto === null) return undefined;
    const dados = JSON.parse(bruto) as SessaoSerializada;
    return {
      id: dados.id as Uuid,
      usuarioId: dados.usuarioId as Uuid,
      tenantId: dados.tenantId as Uuid,
      nivel: dados.nivel,
      criadaEm: Instant.deEpochMs(dados.criadaEm),
      ultimoUso: Instant.deEpochMs(dados.ultimoUso),
    };
  }

  async remover(token: string): Promise<void> {
    await this.redis.del(this.#chave(token));
  }

  async removerTodasDoUsuario(usuarioId: Uuid): Promise<void> {
    const conjunto = this.#doUsuario(usuarioId);
    const hashes = await this.redis.smembers(conjunto);
    await this.redis.del(conjunto, ...hashes.map((hash) => `${this.prefixo}${hash}`));
  }
}
