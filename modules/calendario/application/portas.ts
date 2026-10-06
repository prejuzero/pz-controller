import type { EventoGlobal, FeriadoLocal } from '../domain/evento.js';
import type { LocalDate, Uuid } from '@pz/kernel';

/** Filtro das listagens: eventos que cruzam o período (inclusivo). */
export interface FiltroDoCalendario {
  readonly inicio?: LocalDate;
  readonly fim?: LocalDate;
}

/** Porta: calendário global (tabela `evento_calendario`, sem tenant), na transação do caso de uso. */
export interface RepositorioDeEventosGlobais<Transacao> {
  inserir(transacao: Transacao, evento: EventoGlobal): Promise<void>;
  buscar(transacao: Transacao, id: Uuid): Promise<EventoGlobal | undefined>;
  /** `false` se o evento já não era rascunho (aprovação concorrente). */
  registrarAprovacao(transacao: Transacao, evento: EventoGlobal): Promise<boolean>;
  /** `false` se o evento já tinha sido revogado (revogação concorrente). */
  registrarRevogacao(transacao: Transacao, evento: EventoGlobal): Promise<boolean>;
  listar(transacao: Transacao, filtro: FiltroDoCalendario): Promise<EventoGlobal[]>;
  /** Aprovados e não revogados que cruzam o período. */
  vigentesNoPeriodo(
    transacao: Transacao,
    inicio: LocalDate,
    fim: LocalDate,
  ): Promise<EventoGlobal[]>;
}

/** Porta: feriados locais do tenant da transação (tabela `feriado_local`, RLS). */
export interface RepositorioDeFeriadosLocais<Transacao> {
  inserir(transacao: Transacao, feriado: FeriadoLocal): Promise<void>;
  buscar(transacao: Transacao, id: Uuid): Promise<FeriadoLocal | undefined>;
  /** `false` se o feriado já tinha sido revogado (revogação concorrente). */
  registrarRevogacao(transacao: Transacao, feriado: FeriadoLocal): Promise<boolean>;
  listar(transacao: Transacao, filtro: FiltroDoCalendario): Promise<FeriadoLocal[]>;
  /** Não revogados que cruzam o período. */
  vigentesNoPeriodo(
    transacao: Transacao,
    inicio: LocalDate,
    fim: LocalDate,
  ): Promise<FeriadoLocal[]>;
}
