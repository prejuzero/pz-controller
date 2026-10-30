import { z } from 'zod';

import { DataCivil, Uuid } from './comum.js';
import { Prazo } from './prazos/prazos.js';
import { PublicacaoDoTenant } from './publicacoes.js';
import { definirRota, nomear } from './rota.js';

/** Atalhos de período (RF45), resolvidos no servidor no fuso de São Paulo. */
export const ATALHOS_DE_PERIODO = [
  'hoje',
  'amanha',
  'esta-semana',
  'proxima-semana',
  'este-mes',
  'proximos-30-dias',
  'vencidos',
] as const;

const Texto = z.string().trim().min(1).max(200);

const Periodo = z
  .object({
    atalho: z.enum(ATALHOS_DE_PERIODO).optional(),
    de: DataCivil.optional(),
    ate: DataCivil.optional(),
    campoData: z
      .enum(['vencimento', 'publicacao', 'inicio'])
      .optional()
      .describe(
        'Data alvo (RF47). Padrão: vencimento nos prazos; em publicações só vale "publicacao" (disponibilização).',
      ),
  })
  .strict()
  .refine((p) => p.atalho === undefined || (p.de === undefined && p.ate === undefined), {
    message: 'Use o atalho ou o intervalo, não os dois.',
  });

/**
 * Filtros da busca avançada (RF48): todos combinados com E. Schema único, o mesmo que a busca em
 * linguagem natural (HU47) e a API pública vão usar.
 */
export const FiltrosBusca = nomear(
  'FiltrosBusca',
  z
    .object({
      numeroCnj: z
        .string()
        .trim()
        .max(30)
        .describe('Com ou sem pontuação; 20 dígitos é exato, menos é parcial.')
        .optional(),
      partes: Texto.optional().describe('Busca no teor (o cadastro ainda não guarda as partes).'),
      clienteId: Uuid.optional(),
      tribunal: z.string().trim().min(1).max(20).optional(),
      orgao: Texto.optional().describe('Vara ou órgão julgador, parcial.'),
      comarca: Texto.optional(),
      tiposAto: z.array(z.string().min(1).max(80)).max(50).optional(),
      statusPrazo: z
        .array(z.enum(['a-confirmar', 'pendente', 'cumprido', 'vencido', 'cancelado']))
        .optional(),
      statusCiencia: z.array(z.enum(['pendente', 'confirmada'])).optional(),
      responsavelId: Uuid.optional().describe('Advogado responsável.'),
      oab: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{2}\s*\d{1,7}[A-Za-z]?$/)
        .optional()
        .describe('UF + número, exato (ex.: GO12345).'),
      ramo: z.enum(['civel', 'juizados', 'trabalhista', 'penal', 'juizado-criminal']).optional(),
      palavraChave: Texto.optional().describe('Texto livre no teor, sem diferença de acentos.'),
      origem: z.array(z.enum(['djen', 'manual', 'painel'])).optional(),
      periodo: Periodo.optional(),
      ordem: z.enum(['asc', 'desc']).optional().describe('Pela data alvo; padrão por recurso.'),
      cursor: z.string().max(300).optional(),
      limite: z.number().int().min(1).max(100).default(20),
    })
    .strict(),
);
export type FiltrosBusca = z.input<typeof FiltrosBusca.esquema>;

const Total = {
  totalAproximado: z.number().int().nonnegative(),
  totalLimitado: z.boolean().describe('true: há mais resultados do que o total contado.'),
};

export const ResultadoDaBuscaDePrazos = nomear(
  'ResultadoDaBuscaDePrazos',
  z.object({
    itens: z.array(Prazo.esquema),
    proximoCursor: z.string().nullable(),
    ...Total,
  }),
);
export type ResultadoDaBuscaDePrazos = z.infer<typeof ResultadoDaBuscaDePrazos.esquema>;

export const ResultadoDaBuscaDePublicacoes = nomear(
  'ResultadoDaBuscaDePublicacoes',
  z.object({
    itens: z.array(PublicacaoDoTenant.esquema),
    proximoCursor: z.string().nullable(),
    ...Total,
  }),
);
export type ResultadoDaBuscaDePublicacoes = z.infer<typeof ResultadoDaBuscaDePublicacoes.esquema>;

export const PedidoDeBuscaRapida = nomear(
  'PedidoDeBuscaRapida',
  z.object({ texto: z.string().trim().min(2).max(200) }).strict(),
);

export const SugestoesDaBuscaRapida = nomear(
  'SugestoesDaBuscaRapida',
  z.object({
    processoExato: Uuid.nullable().describe('Número CNJ completo de um processo do escritório.'),
    itens: z
      .array(
        z.object({
          tipo: z.enum(['processo', 'publicacao']),
          id: Uuid,
          titulo: z.string(),
          detalhe: z.string(),
        }),
      )
      .max(8),
  }),
);
export type SugestoesDaBuscaRapida = z.infer<typeof SugestoesDaBuscaRapida.esquema>;

export const buscarPrazos = definirRota({
  id: 'buscarPrazos',
  metodo: 'post',
  caminho: '/v1/busca/prazos',
  resumo: 'Busca avançada de prazos (filtros combinados com E).',
  tag: 'busca',
  corpo: FiltrosBusca,
  resposta: { status: 200, corpo: ResultadoDaBuscaDePrazos },
});

export const buscarPublicacoes = definirRota({
  id: 'buscarPublicacoes',
  metodo: 'post',
  caminho: '/v1/busca/publicacoes',
  resumo: 'Busca avançada de publicações; filtros só de prazo são recusados (400).',
  tag: 'busca',
  corpo: FiltrosBusca,
  resposta: { status: 200, corpo: ResultadoDaBuscaDePublicacoes },
});

export const buscaRapida = definirRota({
  id: 'buscaRapida',
  metodo: 'post',
  caminho: '/v1/busca/rapida',
  resumo: 'Busca rápida do topo: reconhece número CNJ; senão, sugere por número parcial ou teor.',
  tag: 'busca',
  corpo: PedidoDeBuscaRapida,
  resposta: { status: 200, corpo: SugestoesDaBuscaRapida },
});

export const ROTAS_BUSCA = [buscarPrazos, buscarPublicacoes, buscaRapida] as const;
