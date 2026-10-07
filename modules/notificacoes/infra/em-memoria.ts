import { Notificacao } from '../domain/notificacao.js';

import type { RepositorioDeNotificacoes } from '../application/portas.js';
import type { EstadoDaNotificacao } from '../domain/notificacao.js';
import type { TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Notificações em memória, com a chave de idempotência única do Postgres. Só para testes. */
export class NotificacoesEmMemoria implements RepositorioDeNotificacoes<TransacaoEmMemoria> {
  readonly #porId = new Map<Uuid, EstadoDaNotificacao>();

  todas(): EstadoDaNotificacao[] {
    return [...this.#porId.values()];
  }

  inserir(tx: TransacaoEmMemoria, notificacao: Notificacao): Promise<boolean> {
    if (this.todas().some((n) => n.chave === notificacao.estado.chave))
      return Promise.resolve(false);
    tx.aoConfirmar(() => this.#porId.set(notificacao.id, notificacao.estado));
    return Promise.resolve(true);
  }

  buscar(_tx: TransacaoEmMemoria, id: Uuid): Promise<Notificacao | undefined> {
    const estado = this.#porId.get(id);
    return Promise.resolve(estado === undefined ? undefined : Notificacao.restaurar(estado));
  }

  registrarEnvio(tx: TransacaoEmMemoria, notificacao: Notificacao): Promise<void> {
    tx.aoConfirmar(() => this.#porId.set(notificacao.id, notificacao.estado));
    return Promise.resolve();
  }
}
