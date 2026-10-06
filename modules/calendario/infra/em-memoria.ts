import { EventoGlobal, FeriadoLocal } from '../domain/evento.js';

import type {
  FiltroDoCalendario,
  RepositorioDeEventosGlobais,
  RepositorioDeFeriadosLocais,
} from '../application/portas.js';
import type {
  ConteudoDoEvento,
  EstadoDoEventoGlobal,
  EstadoDoFeriadoLocal,
} from '../domain/evento.js';
import type { LocalDate, TransacaoEmMemoria, Uuid } from '@pz/kernel';

const noFiltro = (e: ConteudoDoEvento, filtro: FiltroDoCalendario) =>
  (filtro.inicio === undefined || !e.fim.ehAntesDe(filtro.inicio)) &&
  (filtro.fim === undefined || !e.inicio.ehDepoisDe(filtro.fim));
const porData = (a: ConteudoDoEvento, b: ConteudoDoEvento) => a.inicio.comparar(b.inicio);

/** Calendário global em memória, com a semântica do Postgres. Só para testes. */
export class EventosGlobaisEmMemoria implements RepositorioDeEventosGlobais<TransacaoEmMemoria> {
  readonly #eventos = new Map<string, EstadoDoEventoGlobal>();

  inserir(transacao: TransacaoEmMemoria, evento: EventoGlobal): Promise<void> {
    transacao.aoConfirmar(() => this.#eventos.set(evento.id, evento.estado));
    return Promise.resolve();
  }

  buscar(_transacao: TransacaoEmMemoria, id: Uuid): Promise<EventoGlobal | undefined> {
    const estado = this.#eventos.get(id);
    return Promise.resolve(estado === undefined ? undefined : EventoGlobal.restaurar(estado));
  }

  registrarAprovacao(transacao: TransacaoEmMemoria, evento: EventoGlobal): Promise<boolean> {
    if (this.#eventos.get(evento.id)?.status !== 'rascunho') return Promise.resolve(false);
    transacao.aoConfirmar(() => this.#eventos.set(evento.id, evento.estado));
    return Promise.resolve(true);
  }

  registrarRevogacao(transacao: TransacaoEmMemoria, evento: EventoGlobal): Promise<boolean> {
    const atual = this.#eventos.get(evento.id);
    if (atual?.status !== 'aprovado' || atual.revogadoEm !== undefined) {
      return Promise.resolve(false);
    }
    transacao.aoConfirmar(() => this.#eventos.set(evento.id, evento.estado));
    return Promise.resolve(true);
  }

  listar(_transacao: TransacaoEmMemoria, filtro: FiltroDoCalendario): Promise<EventoGlobal[]> {
    return Promise.resolve(
      [...this.#eventos.values()]
        .filter((e) => noFiltro(e, filtro))
        .sort(porData)
        .map((e) => EventoGlobal.restaurar(e)),
    );
  }

  async vigentesNoPeriodo(transacao: TransacaoEmMemoria, inicio: LocalDate, fim: LocalDate) {
    return (await this.listar(transacao, { inicio, fim })).filter((e) => e.vigente);
  }
}

/** Feriados locais em memória (um só tenant; o isolamento por RLS é testado na integração). */
export class FeriadosLocaisEmMemoria implements RepositorioDeFeriadosLocais<TransacaoEmMemoria> {
  readonly #feriados = new Map<string, EstadoDoFeriadoLocal>();

  inserir(transacao: TransacaoEmMemoria, feriado: FeriadoLocal): Promise<void> {
    transacao.aoConfirmar(() => this.#feriados.set(feriado.id, feriado.estado));
    return Promise.resolve();
  }

  buscar(_transacao: TransacaoEmMemoria, id: Uuid): Promise<FeriadoLocal | undefined> {
    const estado = this.#feriados.get(id);
    return Promise.resolve(estado === undefined ? undefined : FeriadoLocal.restaurar(estado));
  }

  registrarRevogacao(transacao: TransacaoEmMemoria, feriado: FeriadoLocal): Promise<boolean> {
    if (this.#feriados.get(feriado.id)?.revogadoEm !== undefined) return Promise.resolve(false);
    transacao.aoConfirmar(() => this.#feriados.set(feriado.id, feriado.estado));
    return Promise.resolve(true);
  }

  listar(_transacao: TransacaoEmMemoria, filtro: FiltroDoCalendario): Promise<FeriadoLocal[]> {
    return Promise.resolve(
      [...this.#feriados.values()]
        .filter((e) => noFiltro(e, filtro))
        .sort(porData)
        .map((e) => FeriadoLocal.restaurar(e)),
    );
  }

  async vigentesNoPeriodo(transacao: TransacaoEmMemoria, inicio: LocalDate, fim: LocalDate) {
    return (await this.listar(transacao, { inicio, fim })).filter((e) => e.vigente);
  }
}
