import type { RepositorioDeTenants } from '../application/impersonacao.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** Tipo do tenant da transação (`tenant`, RLS: só o próprio fica visível). */
export class TenantsPostgres implements RepositorioDeTenants<Transacao> {
  async tipo(tx: Transacao, tenantId: Uuid): Promise<string | undefined> {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { tipo: true } });
    return tenant?.tipo;
  }
}
