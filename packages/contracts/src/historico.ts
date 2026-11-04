import { z } from 'zod';

import { Instante, Uuid } from './comum.js';
import { definirRota, nomear } from './rota.js';

const Hash = z.string().regex(/^[0-9a-f]{64}$/);

/** Código de verificação do PDF do histórico: o tenant e o resumo do trecho (HU35). */
export const CodigoDeVerificacao = z
  .string()
  .regex(/^[0-9a-f-]{36}\.[0-9a-f]{64}$/)
  .describe('Impresso no PDF do histórico e no QR code.');

export const HistoricoDoPrazo = nomear(
  'HistoricoDoPrazo',
  z.object({
    itens: z.array(
      z.object({
        sequencia: z.number().int().positive(),
        tipo: z.string().describe('Tipo do evento na trilha (ex.: prazos.prazo-confirmado).'),
        entidade: z.string(),
        usuario: z.object({ id: Uuid, nome: z.string().nullable() }).nullable(),
        canal: z.string(),
        criadoEm: Instante.describe('Horário do banco.'),
        antes: z.unknown(),
        depois: z.unknown(),
        hashAnterior: Hash,
        hash: Hash,
      }),
    ),
  }),
);
export type HistoricoDoPrazo = z.infer<typeof HistoricoDoPrazo.esquema>;

export const VerificacaoDoHistorico = nomear(
  'VerificacaoDoHistorico',
  z.discriminatedUnion('situacao', [
    z.object({
      situacao: z.literal('valido'),
      emitidaEm: Instante,
      eventos: z
        .array(
          z.object({
            sequencia: z.number().int().positive(),
            tipo: z.string(),
            criadoEm: Instante,
            hash: Hash,
          }),
        )
        .describe('Só o necessário para conferir o PDF; nada do conteúdo dos eventos.'),
    }),
    z.object({ situacao: z.literal('inexistente') }),
    z.object({ situacao: z.literal('divergente'), motivo: z.string() }),
  ]),
);
export type VerificacaoDoHistorico = z.infer<typeof VerificacaoDoHistorico.esquema>;

export const consultarHistoricoDoPrazo = definirRota({
  id: 'consultarHistoricoDoPrazo',
  metodo: 'get',
  caminho: '/v1/prazos/{id}/historico',
  resumo:
    'Eventos da trilha de auditoria do prazo e das notificações dele, em ordem (somente leitura).',
  tag: 'auditoria',
  parametrosDeCaminho: z.object({ id: Uuid }),
  resposta: { status: 200, corpo: HistoricoDoPrazo },
  erros: [404],
});

export const verificarHistorico = definirRota({
  id: 'verificarHistorico',
  metodo: 'get',
  caminho: '/v1/verificacoes/{codigo}',
  resumo:
    'Confere o PDF do histórico contra a trilha (pública, com limite por IP). Não expõe o conteúdo.',
  tag: 'auditoria',
  parametrosDeCaminho: z.object({ codigo: CodigoDeVerificacao }),
  resposta: { status: 200, corpo: VerificacaoDoHistorico },
});

export const ROTAS_HISTORICO = [consultarHistoricoDoPrazo, verificarHistorico] as const;
