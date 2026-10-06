import type { DiaNaoUtil, Jurisdicao } from '../domain/dias-nao-uteis.js';
import type { EventoGlobal, FeriadoLocal, OrigemDoEvento } from '../domain/evento.js';
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

/**
 * Porta: cache dos dias não úteis por (jurisdição, ano) no tenant corrente (HU13). Só guarda o
 * que `calcular` devolveu; nunca produz data. `invalidar` vem do evento CalendarioAlterado.
 */
export interface CacheDeDiasNaoUteis {
  doAno(
    jurisdicao: Jurisdicao,
    ano: number,
    calcular: () => Promise<DiaNaoUtil[]>,
  ): Promise<DiaNaoUtil[]>;
  invalidar(alteracao: AlteracaoDoCalendario): Promise<void>;
}

/** O que mudou: globais valem para todos os tenants; locais, só para o tenant do evento. */
export interface AlteracaoDoCalendario {
  readonly origem: OrigemDoEvento;
  readonly tenantId: Uuid;
  readonly anos: readonly number[];
}
