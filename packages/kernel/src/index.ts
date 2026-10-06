export { FixedClock, FUSO_PADRAO, hoje, SystemClock } from './clock.js';
export type { Clock } from './clock.js';
export { AggregateRoot, Entity } from './entidade.js';
export type { EventoDominio } from './entidade.js';
export {
  Conflito,
  ErroDominio,
  NaoAutenticado,
  NaoEncontrado,
  Proibido,
  RegraDeNegocio,
  Validacao,
} from './erros.js';
export type { CategoriaErro, ProblemaValidacao } from './erros.js';
export { Instant } from './instant.js';
export { limparOutbox, processarUmaVez, publicarPendentes } from './outbox.js';
export type {
  FilaDoRelay,
  LimpezaDoOutbox,
  Outbox,
  RegistroDeProcessamento,
  ResultadoConsumo,
  ResultadoLimpeza,
  UnidadeDeTrabalho,
} from './outbox.js';
export { OutboxEmMemoria, TransacaoEmMemoria } from './outbox-em-memoria.js';
export { DiaDaSemana, LocalDate } from './local-date.js';
export { err, ok } from './result.js';
export type { Err, Ok, Result } from './result.js';
export { ehUuid, gerarUuidV7, instanteDoUuidV7 } from './uuid.js';
export type { Uuid } from './uuid.js';
