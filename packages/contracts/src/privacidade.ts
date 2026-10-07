import { z } from 'zod';

import { Instante, Uuid } from './comum.js';
import { definirRota, nomear } from './rota.js';

/** Direitos do titular (HU38, LGPD art. 18): exportação dos dados. */
const Escopo = z
  .enum(['titular', 'escritorio'])
  .describe('`titular`: dados pessoais do usuário; `escritorio`: todo o tenant (responsável).');

export const PedidoDeExportacao = nomear('PedidoDeExportacao', z.object({ escopo: Escopo }));

export const ExportacaoSolicitada = nomear(
  'ExportacaoSolicitada',
  z.object({
    id: Uuid,
    nova: z.boolean().describe('false: já havia pedido pendente do mesmo escopo.'),
  }),
);
export type ExportacaoSolicitada = z.infer<typeof ExportacaoSolicitada.esquema>;

export const ExportacaoDeDados = nomear(
  'ExportacaoDeDados',
  z.object({
    id: Uuid,
    escopo: Escopo,
    situacao: z.enum(['pendente', 'concluida']),
    solicitadaEm: Instante,
    concluidaEm: Instante.nullable(),
    expiraEm: Instante.nullable().describe('Os arquivos ficam disponíveis por 7 dias.'),
    arquivos: z
      .array(z.object({ nome: z.string(), url: z.url() }))
      .describe('Links assinados (15 min) para JSON e CSV, quando concluída e dentro da validade.'),
  }),
);
export type ExportacaoDeDados = z.infer<typeof ExportacaoDeDados.esquema>;

export const solicitarExportacao = definirRota({
  id: 'solicitarExportacao',
  metodo: 'post',
  caminho: '/v1/privacidade/exportacoes',
  resumo: 'Pede a exportação dos dados (JSON e CSV), gerada em segundo plano.',
  tag: 'privacidade',
  corpo: PedidoDeExportacao,
  resposta: { status: 202, corpo: ExportacaoSolicitada },
});

export const consultarExportacao = definirRota({
  id: 'consultarExportacao',
  metodo: 'get',
  caminho: '/v1/privacidade/exportacoes/{id}',
  resumo: 'Situação do pedido de exportação e, quando pronto, os links dos arquivos.',
  tag: 'privacidade',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 200, corpo: ExportacaoDeDados },
  erros: [404],
});

export const ROTAS_PRIVACIDADE = [solicitarExportacao, consultarExportacao] as const;
