import { executarNoTenant, OutboxPostgres } from '@pz/db';

import { hashDoToken } from './tokens.js';

import type { EmailsDosUsuarios } from '../application/avisos.js';
import type {
  ArmazemDeRedefinicoes,
  PedidoDeRedefinicao,
  PublicadorDeEventos,
} from '../application/redefinicao.js';
import type { Banco, Transacao } from '@pz/db';
import type { EventoDominio, Instant, Uuid } from '@pz/kernel';
import type { Redis } from 'ioredis';

/** Tokens de redefinição no Redis: chave = SHA-256 do token, TTL = validade, uso único (GETDEL). */
export class RedefinicoesRedis implements ArmazemDeRedefinicoes {
  constructor(
    private readonly redis: Redis,
    private readonly prefixo = 'pz:redefinicao:',
  ) {}

  async guardar(token: string, pedido: PedidoDeRedefinicao, expiraEm: Instant): Promise<void> {
    const doUsuario = `${this.prefixo}usuario:${pedido.usuarioId}`;
    const anterior = await this.redis.get(doUsuario);
    const hash = hashDoToken(token);
    const multi = this.redis
      .multi()
      .set(`${this.prefixo}${hash}`, JSON.stringify(pedido), 'PXAT', expiraEm.epochMs)
      .set(doUsuario, hash, 'PXAT', expiraEm.epochMs);
    if (anterior !== null) multi.del(`${this.prefixo}${anterior}`);
    await multi.exec();
  }

  async consumir(token: string): Promise<PedidoDeRedefinicao | undefined> {
    const bruto = await this.redis.getdel(`${this.prefixo}${hashDoToken(token)}`);
    if (bruto === null) return undefined;
    const pedido = JSON.parse(bruto) as PedidoDeRedefinicao;
    await this.redis.del(`${this.prefixo}usuario:${pedido.usuarioId}`);
    return pedido;
  }
}

/** Publica no outbox do PostgreSQL, no tenant do evento (pz_app, sob RLS). */
export class PublicadorOutbox implements PublicadorDeEventos {
  readonly #outbox = new OutboxPostgres();

  constructor(private readonly banco: Banco) {}

  async publicar(tenantId: Uuid, eventos: readonly EventoDominio[]): Promise<void> {
    await executarNoTenant(tenantId, () =>
      this.banco.executar((tx) => this.#outbox.gravar(tx, eventos)),
    );
  }
}

export class EmailsDosUsuariosPostgres implements EmailsDosUsuarios<Transacao> {
  async emailDe(transacao: Transacao, usuarioId: Uuid): Promise<string | undefined> {
    const usuario = await transacao.usuario.findUnique({
      where: { id: usuarioId },
      select: { email: true },
    });
    return usuario?.email;
  }
}

/** Liga o caso de uso ao contexto de tenant do banco (RLS). */
export const noTenantDoBanco = <Resultado>(tenantId: Uuid, trabalho: () => Promise<Resultado>) =>
  executarNoTenant(tenantId, trabalho);
