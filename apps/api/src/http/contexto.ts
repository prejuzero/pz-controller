import { gerarUuidV7 } from '@pz/kernel';
import { executarComContexto, registrarRotaHttp } from '@pz/observability';

import type { FastifyInstance } from 'fastify';

export const CABECALHO_REQUEST_ID = 'x-request-id';
const FORMATO_REQUEST_ID = /^[\w.:-]{8,128}$/;

/**
 * Abre o contexto de correlação de cada requisição (ADR-011): reaproveita um `x-request-id`
 * válido recebido do balanceador, ou gera um, e o devolve na resposta. Logs, erros e eventos
 * da requisição carregam esse id. tenantId e userId entram com a autenticação (HU06).
 * Também informa a rota ao trace: a instrumentação do NestJS ainda não suporta a versão 12.
 */
export function registrarContextoDeRequisicao(servidor: FastifyInstance): void {
  servidor.addHook('onRequest', (requisicao, resposta, continuar) => {
    const recebido = requisicao.headers[CABECALHO_REQUEST_ID];
    const requestId =
      typeof recebido === 'string' && FORMATO_REQUEST_ID.test(recebido) ? recebido : gerarUuidV7();
    void resposta.header(CABECALHO_REQUEST_ID, requestId);
    // Rota resolvida (padrão com :parametros): http.route nos traces e nas métricas por rota.
    const rota = requisicao.routeOptions.url;
    if (rota !== undefined) registrarRotaHttp(requisicao.method, rota);
    executarComContexto({ requestId }, () => {
      continuar();
    });
  });
}
