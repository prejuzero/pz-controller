import { z } from 'zod';

import { FiltroGlobal, FiltrosBusca } from './busca.js';
import { DataCivil, Instante, Uuid } from './comum.js';
import { definirRota, nomear } from './rota.js';

const Formato = z.enum(['pdf', 'xlsx']);
const Tipo = z.enum(['agenda', 'busca-prazos', 'busca-publicacoes', 'controle-ciencia']);

/** Filtros de uma busca (HU28) sem paginação: o relatório traz todo o resultado (até 5.000). */
const FiltrosDaBusca = FiltrosBusca.esquema.omit({ cursor: true, limite: true });

/**
 * Pedido de relatório (HU29): a agenda de prazos de um período (com o filtro global) ou o
 * resultado de uma busca, com os mesmos filtros da tela.
 */
export const PedidoDeRelatorio = nomear(
  'PedidoDeRelatorio',
  z.discriminatedUnion('tipo', [
    z
      .object({
        tipo: z.literal('agenda'),
        formato: Formato,
        filtros: FiltroGlobal.esquema
          .omit({ de: true, ate: true })
          .extend({ de: DataCivil, ate: DataCivil })
          .strict(),
      })
      .strict(),
    z
      .object({
        // controle-ciencia (HU34): os prazos da busca com ciência e notificações de cada um.
        tipo: z.enum(['busca-prazos', 'busca-publicacoes', 'controle-ciencia']),
        formato: Formato,
        filtros: FiltrosDaBusca,
      })
      .strict(),
  ]),
);
export type PedidoDeRelatorio = z.input<typeof PedidoDeRelatorio.esquema>;

export const RelatorioSolicitado = nomear('RelatorioSolicitado', z.object({ id: Uuid }));
export type RelatorioSolicitado = z.infer<typeof RelatorioSolicitado.esquema>;

export const Relatorio = nomear(
  'Relatorio',
  z.object({
    id: Uuid,
    tipo: Tipo,
    formato: Formato,
    filtros: z.record(z.string(), z.unknown()).describe('Filtros como foram pedidos.'),
    situacao: z.enum(['pendente', 'concluido', 'falhou']),
    linhas: z.number().int().nonnegative().nullable(),
    solicitadoEm: Instante,
    concluidoEm: Instante.nullable(),
    expiraEm: Instante.nullable().describe('O arquivo fica disponível por 24 h.'),
    url: z
      .url()
      .nullable()
      .describe(
        'Link assinado (até 15 min) do arquivo, quando concluído e dentro das 24 h de validade.',
      ),
  }),
);
export type Relatorio = z.infer<typeof Relatorio.esquema>;

export const Relatorios = nomear('Relatorios', z.object({ itens: z.array(Relatorio.esquema) }));
export type Relatorios = z.infer<typeof Relatorios.esquema>;

export const solicitarRelatorio = definirRota({
  id: 'solicitarRelatorio',
  metodo: 'post',
  caminho: '/v1/relatorios',
  resumo: 'Pede um relatório (PDF ou Excel), gerado em segundo plano.',
  tag: 'relatorios',
  corpo: PedidoDeRelatorio,
  resposta: { status: 202, corpo: RelatorioSolicitado },
});

export const listarRelatorios = definirRota({
  id: 'listarRelatorios',
  metodo: 'get',
  caminho: '/v1/relatorios',
  resumo: 'Relatórios recentes do usuário, do mais novo ao mais antigo.',
  tag: 'relatorios',
  resposta: { status: 200, corpo: Relatorios },
});

export const consultarRelatorio = definirRota({
  id: 'consultarRelatorio',
  metodo: 'get',
  caminho: '/v1/relatorios/{id}',
  resumo: 'Situação do relatório e, quando pronto, o link do arquivo.',
  tag: 'relatorios',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 200, corpo: Relatorio },
  erros: [404],
});

export const ROTAS_RELATORIOS = [solicitarRelatorio, listarRelatorios, consultarRelatorio] as const;
