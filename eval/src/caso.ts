import { z } from 'zod';

/** Código no mesmo formato de `tipo_ato.codigo` (HU15); "desconhecido" é a resposta esperada. */
const CODIGO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Anotadores e revisores entram por pseudônimo (ex.: "adv-03"), nunca pelo nome. */
const PSEUDONIMO = z.string().regex(/^[a-z]+-\d{2,}$/, 'use um pseudônimo como "adv-03"');

export const RAMOS_DA_AVALIACAO = ['civel', 'juizados', 'trabalhista', 'penal'] as const;
export const UNIDADES_ANOTADAS = ['dias', 'dias-uteis', 'horas', 'meses', 'anos'] as const;

/**
 * Um caso do conjunto de avaliação (PZ-160): teor anonimizado e a anotação de um advogado,
 * conferida por outro. A anotação diz o que o texto **diz** (ato, prazo citado, trecho); nunca
 * traz data de vencimento (ADR-008).
 */
export const CasoDeAvaliacao = z
  .object({
    id: z.string().regex(CODIGO),
    /** "ficticio" serve só para testar o fluxo; a meta de 98% vale sobre os reais. */
    origem: z.enum(['ficticio', 'real-anonimizado']),
    ramo: z.enum(RAMOS_DA_AVALIACAO),
    teor: z.string().min(20).max(20_000),
    anotacao: z
      .object({
        tipoAto: z.string().regex(CODIGO),
        /** Trecho literal do teor que justifica o ato (vazio só para "desconhecido"). */
        trecho: z.string().max(2000),
        prazoCitado: z
          .object({
            quantidade: z.number().int().positive(),
            unidade: z.enum(UNIDADES_ANOTADAS),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    anotador: PSEUDONIMO,
    /** null: anotação ainda não conferida (não entra na meta). */
    revisor: PSEUDONIMO.nullable(),
    /** Quem conferiu a anonimização à mão; obrigatório nos casos reais. */
    anonimizacaoConferidaPor: PSEUDONIMO.nullable(),
  })
  .strict();

export type CasoDeAvaliacao = z.infer<typeof CasoDeAvaliacao>;
