import type { FeedDaAgenda, RepositorioDeFeeds } from '../application/agenda.js';
import type { Instant, TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Feeds em memória (HU50), um tenant só. Só para testes. */
export class FeedsEmMemoria implements RepositorioDeFeeds<TransacaoEmMemoria> {
  readonly feeds: (FeedDaAgenda & { tokenHash: string; revogadoEm: Instant | null })[] = [];
  tenantsSuspensos = new Set<string>();

  ativo(_tx: TransacaoEmMemoria, usuarioId: Uuid): Promise<FeedDaAgenda | undefined> {
    return Promise.resolve(
      this.feeds.find((f) => f.usuarioId === usuarioId && f.revogadoEm === null),
    );
  }

  criar(tx: TransacaoEmMemoria, feed: FeedDaAgenda, tokenHash: string): Promise<void> {
    tx.aoConfirmar(() => this.feeds.push({ ...feed, tokenHash, revogadoEm: null }));
    return Promise.resolve();
  }

  revogarAtivo(tx: TransacaoEmMemoria, usuarioId: Uuid, em: Instant): Promise<boolean> {
    const ativo = this.feeds.find((f) => f.usuarioId === usuarioId && f.revogadoEm === null);
    if (ativo === undefined) return Promise.resolve(false);
    tx.aoConfirmar(() => {
      ativo.revogadoEm = em;
    });
    return Promise.resolve(true);
  }

  registrarAcesso(tx: TransacaoEmMemoria, id: Uuid, em: Instant): Promise<void> {
    tx.aoConfirmar(() => {
      const i = this.feeds.findIndex((f) => f.id === id);
      const atual = this.feeds[i];
      if (atual !== undefined) this.feeds[i] = { ...atual, ultimoAcesso: em };
    });
    return Promise.resolve();
  }

  localizar(tokenHash: string) {
    const f = this.feeds.find((x) => x.tokenHash === tokenHash);
    return Promise.resolve(
      f === undefined
        ? undefined
        : {
            id: f.id,
            tenantId: f.tenantId,
            usuarioId: f.usuarioId,
            ativo: f.revogadoEm === null && !this.tenantsSuspensos.has(f.tenantId),
          },
    );
  }
}
