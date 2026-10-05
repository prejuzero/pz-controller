import { gerarOpenApi } from './openapi.js';
import { ROTAS_SAUDE } from './saude/index.js';

export {
  CABECALHO_IDEMPOTENCIA,
  ChaveIdempotencia,
  ConsultaPaginada,
  DataCivil,
  Instante,
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
  pagina,
  Problema,
  Uuid,
} from './comum.js';
export { catalogoDeEventos, definirEvento, EVENTOS, SituacaoVerificada } from './eventos/index.js';
export type { ContratoEvento } from './eventos/index.js';
export { gerarOpenApi } from './openapi.js';
export type { OpcoesOpenApi } from './openapi.js';
export { definirRota, nomear } from './rota.js';
export type { EsquemaNomeado, MetodoHttp, Rota, StatusDeErro } from './rota.js';
export { consultarSituacao, ROTAS_SAUDE, SituacaoDaApi } from './saude/index.js';

/** Todas as rotas da API `/v1`. Cada módulo novo acrescenta as suas aqui. */
export const ROTAS = [...ROTAS_SAUDE] as const;

/** O documento OpenAPI 3.1 da API, gerado das rotas (é o que `openapi.json` guarda). */
export function documentoOpenApi(): Record<string, unknown> {
  return gerarOpenApi({
    titulo: 'PrejuZero API',
    versao: '1',
    descricao:
      'API do PrejuZero. Erros em application/problem+json (RFC 9457), paginação por cursor e Idempotency-Key em operações sensíveis (ADR-009).',
    rotas: ROTAS,
  });
}
