import { createHash, randomBytes } from 'node:crypto';

import { Instant } from '@pz/kernel';

import type { FeedDaAgenda, RepositorioDeFeeds, TokensDoFeed } from '../application/agenda.js';
import type { Banco, Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** 32 bytes aleatórios em base64url; no banco, o SHA-256 em hexadecimal. */
export const tokensDoFeed: TokensDoFeed = {
  novo: () => randomBytes(32).toString('base64url'),
  hash: (token) => createHash('sha256').update(token, 'utf8').digest('hex'),
};

type Linha = NonNullable<Awaited<ReturnType<Transacao['feedAgenda']['findFirst']>>>;
const feed = (l: Linha): FeedDaAgenda => ({
  id: l.id as Uuid,
  tenantId: l.tenantId as Uuid,
  usuarioId: l.usuarioId as Uuid,
  criadoEm: Instant.deEpochMs(l.criadoEm.getTime()),
  ultimoAcesso: l.ultimoAcesso === null ? null : Instant.deEpochMs(l.ultimoAcesso.getTime()),
});

/** Feeds da agenda no tenant da transação (RLS); a busca pelo token usa a função restrita. */
export class FeedsPostgres implements RepositorioDeFeeds<Transacao> {
  constructor(private readonly banco: Banco) {}

  async ativo(tx: Transacao, usuarioId: Uuid): Promise<FeedDaAgenda | undefined> {
    const l = await tx.feedAgenda.findFirst({ where: { usuarioId, revogadoEm: null } });
    return l === null ? undefined : feed(l);
  }

  async criar(tx: Transacao, f: FeedDaAgenda, tokenHash: string): Promise<void> {
    await tx.feedAgenda.create({
      data: {
        id: f.id,
        tenantId: f.tenantId,
        usuarioId: f.usuarioId,
        tokenHash,
        criadoEm: new Date(f.criadoEm.epochMs),
      },
    });
  }

  async revogarAtivo(tx: Transacao, usuarioId: Uuid, em: Instant): Promise<boolean> {
    const { count } = await tx.feedAgenda.updateMany({
      where: { usuarioId, revogadoEm: null },
      data: { revogadoEm: new Date(em.epochMs) },
    });
    return count > 0;
  }

  async registrarAcesso(tx: Transacao, id: Uuid, em: Instant): Promise<void> {
    await tx.feedAgenda.update({ where: { id }, data: { ultimoAcesso: new Date(em.epochMs) } });
  }

  async localizar(tokenHash: string) {
    if (!/^[0-9a-f]{64}$/.test(tokenHash)) return undefined;
    const [l] = await this.banco.executarSemTenant(
      'agenda: localizar feed',
      (tx) =>
        tx.$queryRaw<{ id: string; tenant_id: string; usuario_id: string; ativo: boolean }[]>`
        SELECT id, tenant_id, usuario_id, ativo FROM pz_localizar_feed_agenda(${tokenHash})`,
    );
    return l === undefined
      ? undefined
      : {
          id: l.id as Uuid,
          tenantId: l.tenant_id as Uuid,
          usuarioId: l.usuario_id as Uuid,
          ativo: l.ativo,
        };
  }
}
