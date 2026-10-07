import { Advogado } from '../domain/advogado.js';

import type { RepositorioDeAdvogados } from '../application/portas.js';
import type { EstadoDoAdvogado, Oab } from '../domain/advogado.js';
import type { Clock, TransacaoEmMemoria, Uuid } from '@pz/kernel';

/**
 * Advogados em memória com a semântica do Postgres: CPF e OAB ativa únicos em toda a base,
 * mudanças só na confirmação da transação. Só para testes.
 */
export class AdvogadosEmMemoria implements RepositorioDeAdvogados<TransacaoEmMemoria> {
  readonly #advogados = new Map<Uuid, EstadoDoAdvogado>();

  constructor(private readonly relogio: Clock) {}

  #oabAtivaEmUso(oab: Oab): boolean {
    return [...this.#advogados.values()].some((a) =>
      a.oabs.some((o) => o.ativa && o.numero === oab.numero && o.uf === oab.uf),
    );
  }

  inserir(tx: TransacaoEmMemoria, advogado: Advogado): Promise<'ok' | 'cpf-em-uso' | 'oab-em-uso'> {
    const estado = advogado.estado;
    if ([...this.#advogados.values()].some((a) => a.cpf === estado.cpf))
      return Promise.resolve('cpf-em-uso');
    if (estado.oabs.some((oab) => this.#oabAtivaEmUso(oab))) return Promise.resolve('oab-em-uso');
    tx.aoConfirmar(() => this.#advogados.set(estado.usuarioId, estado));
    return Promise.resolve('ok');
  }

  buscarPorUsuario(_tx: TransacaoEmMemoria, usuarioId: Uuid): Promise<Advogado | undefined> {
    const estado = this.#advogados.get(usuarioId);
    return Promise.resolve(
      estado === undefined ? undefined : Advogado.restaurar(estado, this.relogio),
    );
  }

  salvarPerfil(tx: TransacaoEmMemoria, advogado: Advogado): Promise<void> {
    tx.aoConfirmar(() => this.#advogados.set(advogado.estado.usuarioId, advogado.estado));
    return Promise.resolve();
  }

  inserirOab(tx: TransacaoEmMemoria, advogado: Advogado, oab: Oab): Promise<boolean> {
    if (this.#oabAtivaEmUso(oab)) return Promise.resolve(false);
    tx.aoConfirmar(() => this.#advogados.set(advogado.estado.usuarioId, advogado.estado));
    return Promise.resolve(true);
  }

  desativarOab(tx: TransacaoEmMemoria, oab: Oab): Promise<void> {
    tx.aoConfirmar(() => {
      for (const [usuario, estado] of this.#advogados) {
        if (!estado.oabs.some((o) => o.id === oab.id)) continue;
        this.#advogados.set(usuario, {
          ...estado,
          oabs: estado.oabs.map((o) => (o.id === oab.id ? oab : o)),
        });
      }
    });
    return Promise.resolve();
  }
}
