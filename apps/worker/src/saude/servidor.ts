import { createServer } from 'node:http';

import type { ConsultarSituacao } from '@pz/saude';
import type { Server } from 'node:http';

/**
 * Servidor mínimo de saúde do worker (o worker não tem API HTTP): `live` diz se o processo
 * está de pé; `ready` diz se as dependências respondem.
 */
export function criarServidorDeSaude(consultar: ConsultarSituacao): Server {
  return createServer((requisicao, resposta) => {
    const responder = (status: number, corpo: unknown) => {
      resposta.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      resposta.end(JSON.stringify(corpo));
    };
    if (requisicao.method !== 'GET') {
      responder(405, { situacao: 'metodo-nao-permitido' });
    } else if (requisicao.url === '/health/live') {
      responder(200, { situacao: 'vivo' });
    } else if (requisicao.url === '/health/ready') {
      void consultar.executar().then((relatorio) => {
        responder(relatorio.situacao === 'operacional' ? 200 : 503, {
          situacao: relatorio.situacao,
          dependencias: relatorio.dependencias.map(({ dependencia, disponivel, latenciaMs }) => ({
            dependencia,
            disponivel,
            latenciaMs,
          })),
        });
      });
    } else {
      responder(404, { situacao: 'nao-encontrado' });
    }
  });
}
