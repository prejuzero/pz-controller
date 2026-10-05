// API pública do módulo saude (CLAUDE.md, seção 6): outros módulos e as apps só usam o que está aqui.
export { ConsultarSituacao } from './application/consultar-situacao.js';
export type {
  RelatorioDeSituacao,
  VerificadorDeDependencia,
} from './application/consultar-situacao.js';
export {
  CONSUMIDOR_HISTORICO,
  RegistrarHistoricoDeSituacao,
  RegistrarVerificacao,
} from './application/registrar-verificacao.js';
export type {
  EntradaDoHistorico,
  HistoricoDeSituacao,
} from './application/registrar-verificacao.js';
export { avaliarSituacao } from './domain/situacao.js';
export type { ResultadoVerificacao, Situacao, SituacaoVerificada } from './domain/situacao.js';
export { HistoricoEmMemoria } from './infra/historico-em-memoria.js';
export { VerificadorHttp, VerificadorTcp } from './infra/verificadores.js';
