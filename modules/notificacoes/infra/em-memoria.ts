import { ConsentimentoCanal } from '../domain/consentimento.js';
import { Notificacao } from '../domain/notificacao.js';

import type {
  DestinoPushNovo,
  RepositorioDeConsentimentos,
  RepositorioDeDestinosPush,
  RepositorioDeNotificacoes,
} from '../application/portas.js';
import type { CanalComConsentimento, EstadoDoConsentimento } from '../domain/consentimento.js';
import type { EstadoDaNotificacao } from '../domain/notificacao.js';
import type { Instant, TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Notificações em memória, com a chave de idempotência única do Postgres. Só para testes. */
export class NotificacoesEmMemoria implements RepositorioDeNotificacoes<TransacaoEmMemoria> {
  readonly #porId = new Map<Uuid, EstadoDaNotificacao>();
  /** Escritas ainda não confirmadas, visíveis na própria transação (como no Postgres). */
  readonly #naTransacao = new WeakMap<TransacaoEmMemoria, Map<Uuid, EstadoDaNotificacao>>();

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

  buscarPorIdExterno(tx: TransacaoEmMemoria, idExterno: string): Promise<Notificacao | undefined> {
    const visiveis = new Map([...this.#porId, ...(this.#naTransacao.get(tx) ?? [])]);
    const estado = [...visiveis.values()].find((n) => n.idExterno === idExterno);
    return Promise.resolve(estado === undefined ? undefined : Notificacao.restaurar(estado));
  }

  registrarDesfecho(tx: TransacaoEmMemoria, notificacao: Notificacao): Promise<void> {
    let pendentes = this.#naTransacao.get(tx);
    if (pendentes === undefined) {
      pendentes = new Map();
      this.#naTransacao.set(tx, pendentes);
    }
    pendentes.set(notificacao.id, notificacao.estado);
    return this.registrarEnvio(tx, notificacao);
  }

  usuariosComRejeicaoDesde(_tx: TransacaoEmMemoria, desde: Instant): Promise<number> {
    const usuarios = this.todas()
      .filter((n) => n.rejeitadaEm !== undefined && !n.rejeitadaEm.ehAntesDe(desde))
      .map((n) => n.usuarioId);
    return Promise.resolve(new Set(usuarios).size);
  }
}

/** Consentimentos e destinos de push em memória, com o "um ativo por destino" do Postgres. */
export class ConsentimentosEmMemoria
  implements
    RepositorioDeConsentimentos<TransacaoEmMemoria>,
    RepositorioDeDestinosPush<TransacaoEmMemoria>
{
  readonly #consentimentos = new Map<Uuid, EstadoDoConsentimento>();
  readonly #push = new Map<Uuid, DestinoPushNovo & { id: Uuid; ativo: boolean }>();

  ativos(_tx: TransacaoEmMemoria, usuarioId: Uuid): Promise<ConsentimentoCanal[]> {
    return Promise.resolve(
      [...this.#consentimentos.values()]
        .filter((c) => c.usuarioId === usuarioId && c.revogadoEm === undefined)
        .map((c) => ConsentimentoCanal.restaurar(c)),
    );
  }

  buscar(_tx: TransacaoEmMemoria, id: Uuid): Promise<ConsentimentoCanal | undefined> {
    const c = this.#consentimentos.get(id);
    return Promise.resolve(c === undefined ? undefined : ConsentimentoCanal.restaurar(c));
  }

  inserir(tx: TransacaoEmMemoria, consentimento: ConsentimentoCanal): Promise<boolean> {
    const e = consentimento.estado;
    const repetido = [...this.#consentimentos.values()].some(
      (c) =>
        c.usuarioId === e.usuarioId &&
        c.canal === e.canal &&
        c.destino === e.destino &&
        c.revogadoEm === undefined,
    );
    if (repetido) return Promise.resolve(false);
    tx.aoConfirmar(() => this.#consentimentos.set(e.id, e));
    return Promise.resolve(true);
  }

  registrarRevogacao(tx: TransacaoEmMemoria, consentimento: ConsentimentoCanal): Promise<void> {
    tx.aoConfirmar(() => this.#consentimentos.set(consentimento.id, consentimento.estado));
    return Promise.resolve();
  }

  async enderecos(
    tx: TransacaoEmMemoria,
    usuarioId: Uuid,
    canal: CanalComConsentimento,
  ): Promise<readonly string[]> {
    const destinos = (await this.ativos(tx, usuarioId))
      .filter((c) => c.estado.canal === canal)
      .map((c) => c.estado.destino);
    if (canal !== 'push') return destinos;
    return [...this.#push.values()]
      .filter((p) => p.usuarioId === usuarioId && p.ativo && destinos.includes(p.dispositivoId))
      .map((p) => p.token);
  }

  gravar(tx: TransacaoEmMemoria, d: DestinoPushNovo, id: Uuid): Promise<Uuid> {
    const atual = [...this.#push.values()].find((p) => p.dispositivoId === d.dispositivoId);
    const gravado = atual?.id ?? id;
    tx.aoConfirmar(() => this.#push.set(gravado, { ...d, id: gravado, ativo: true }));
    return Promise.resolve(gravado);
  }

  desativar(
    tx: TransacaoEmMemoria,
    usuarioId: Uuid,
    dispositivoId: Uuid,
  ): Promise<Uuid | undefined> {
    const atual = [...this.#push.values()].find(
      (p) => p.usuarioId === usuarioId && p.dispositivoId === dispositivoId && p.ativo,
    );
    if (atual === undefined) return Promise.resolve(undefined);
    tx.aoConfirmar(() => this.#push.set(atual.id, { ...atual, ativo: false }));
    return Promise.resolve(atual.id);
  }
}
