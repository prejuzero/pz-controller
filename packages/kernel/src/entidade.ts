import type { Instant } from './instant.js';
import type { Uuid } from './uuid.js';

/**
 * Fato de negócio já ocorrido, publicado via outbox (ADR-004). `tipo` + `versao` identificam
 * o schema do evento em packages/contracts.
 */
export interface EventoDominio<Tipo extends string = string, Payload = unknown> {
  readonly id: Uuid;
  readonly tipo: Tipo;
  readonly versao: number;
  readonly tenantId: Uuid;
  readonly agregadoId: string;
  readonly ocorridoEm: Instant;
  readonly payload: Payload;
}

/** Objeto com identidade: duas entidades são a mesma se tiverem a mesma classe e o mesmo id. */
export abstract class Entity<Id extends string = Uuid> {
  constructor(readonly id: Id) {}

  igual(outra: Entity<Id>): boolean {
    return outra.constructor === this.constructor && outra.id === this.id;
  }
}

/**
 * Raiz de agregado: registra os eventos das mudanças; o repositório os grava no outbox
 * na mesma transação do agregado e depois os retira.
 */
export abstract class AggregateRoot<
  Evento extends EventoDominio = EventoDominio,
  Id extends string = Uuid,
> extends Entity<Id> {
  #eventos: Evento[] = [];

  protected registrarEvento(evento: Evento): void {
    this.#eventos.push(Object.freeze({ ...evento }));
  }

  eventosPendentes(): readonly Evento[] {
    return [...this.#eventos];
  }

  /** Entrega os eventos pendentes e esvazia a lista: cada evento sai uma única vez. */
  retirarEventos(): readonly Evento[] {
    const eventos = this.#eventos;
    this.#eventos = [];
    return eventos;
  }
}
