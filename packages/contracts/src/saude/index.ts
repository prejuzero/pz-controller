import { z } from 'zod';

import { Instante } from '../comum.js';
import { definirRota, nomear } from '../rota.js';

/**
 * Módulo de exemplo "saude" (HU04): demonstra o desenho ponta a ponta (rota, caso de uso,
 * evento e consumidor) que todo módulo segue. Não é o healthcheck de infraestrutura
 * (`/health/live` e `/health/ready` ficam fora do `/v1`).
 */
export const SituacaoDaApi = nomear(
  'SituacaoDaApi',
  z.object({
    situacao: z.enum(['operacional', 'degradada']),
    versao: z.string().describe('Versão implantada (SHA do commit).'),
    verificadoEm: Instante,
  }),
);
export type SituacaoDaApi = z.infer<typeof SituacaoDaApi.esquema>;

export const consultarSituacao = definirRota({
  id: 'consultarSituacao',
  metodo: 'get',
  caminho: '/v1/saude',
  resumo: 'Situação da API, para clientes verificarem a conexão.',
  tag: 'saude',
  publica: true,
  resposta: { status: 200, corpo: SituacaoDaApi },
});

export const ROTAS_SAUDE = [consultarSituacao] as const;
