import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { concede, ConsultarPermissoes, ValidarSessao } from '@pz/identidade';

import { COOKIE_SESSAO, lerCookies } from '../auth/cookies.js';
import { FILAS_DO_PAINEL } from '../fichas.js';
import { problema } from '../http/problemas.js';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Queue } from 'bullmq';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export const CAMINHO_DO_PAINEL = '/admin/filas';

function negar(resposta: FastifyReply, status: number, codigo: string): FastifyReply {
  return resposta.status(status).type('application/problem+json').send(problema(status, codigo));
}

/**
 * Painel das filas (Bull Board) em /admin/filas (HU07, herdado da HU10). Fica fora dos
 * controllers, então a guarda é própria: só pelo navegador (cookie de sessão completa) e só
 * com `admin:filas`, que a impersonação não concede (só leitura de tenant). O painel só lê:
 * sem botões de ação e só GET; reprocessar a DLQ é pela rota auditada `reprocessarJobMorto`.
 */
export async function registrarPainelDeFilas(api: NestFastifyApplication): Promise<void> {
  const validar = api.get(ValidarSessao);
  const consultarPermissoes = api.get(ConsultarPermissoes);
  const filas = api.get<symbol, readonly Queue[]>(FILAS_DO_PAINEL);

  const adaptador = new FastifyAdapter();
  adaptador.setBasePath(CAMINHO_DO_PAINEL);
  createBullBoard({
    queues: filas.map(
      (fila) => new BullMQAdapter(fila, { readOnlyMode: true, allowRetries: false }),
    ),
    serverAdapter: adaptador,
    options: { uiConfig: { boardTitle: 'PrejuZero · filas' } },
  });

  async function guarda(requisicao: FastifyRequest, resposta: FastifyReply) {
    if (requisicao.method !== 'GET' && requisicao.method !== 'HEAD') {
      return negar(resposta, 405, 'metodo.nao-permitido');
    }
    const token = lerCookies(requisicao.headers.cookie).get(COOKIE_SESSAO);
    if (token === undefined) return negar(resposta, 401, 'autenticacao.necessaria');
    const sessao = await validar.executar(token);
    if (!sessao.ok || sessao.valor.nivel !== 'completo') {
      return negar(resposta, 401, 'autenticacao.necessaria');
    }
    const permissoes = await consultarPermissoes.executar(sessao.valor);
    if (!concede(permissoes, ['admin:filas'])) return negar(resposta, 403, 'acesso.negado');
    return undefined;
  }

  await api.register(async (escopo: FastifyInstance) => {
    escopo.addHook('onRequest', guarda);
    await escopo.register(adaptador.registerPlugin(), { prefix: CAMINHO_DO_PAINEL });
  });
}
