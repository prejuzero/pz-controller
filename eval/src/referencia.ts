import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { RegraRapida, TipoDaTaxonomia } from '@pz/classificacao';

const CODIGO = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/**
 * Cópia versionada da taxonomia (HU15) e das regras rápidas vigentes (HU20) usada pelo runner.
 * Fica no repositório para o CI rodar sem banco e para a mudança de taxonomia ou de regra ser
 * revisada no PR. `provisoria: true` = rascunho, sem valor para a meta.
 */
const Cabecalho = {
  versao: z.string().min(1),
  provisoria: z.boolean(),
  observacao: z.string(),
};

export const TaxonomiaDaAvaliacao = z
  .object({
    ...Cabecalho,
    tipos: z
      .array(z.object({ codigo: CODIGO, nome: z.string().min(1), descricao: z.string() }).strict())
      .min(1),
  })
  .strict();
export type TaxonomiaDaAvaliacao = z.infer<typeof TaxonomiaDaAvaliacao>;

export const RegrasDaAvaliacao = z
  .object({
    ...Cabecalho,
    regras: z.array(
      z
        .object({
          codigo: CODIGO,
          versao: z.number().int().positive(),
          tipoAto: CODIGO,
          padroes: z.array(z.string().min(1)).min(1),
          confianca: z.number().min(0).max(1),
        })
        .strict(),
    ),
  })
  .strict();
export type RegrasDaAvaliacao = z.infer<typeof RegrasDaAvaliacao>;

export interface Referencia {
  readonly taxonomia: TaxonomiaDaAvaliacao;
  readonly regras: RegrasDaAvaliacao;
}

export const PASTA_DA_REFERENCIA = fileURLToPath(new URL('../referencia', import.meta.url));

const lerJson = (pasta: string, nome: string): unknown =>
  JSON.parse(readFileSync(`${pasta}/${nome}`, 'utf8'));

/** Lê e valida a referência; regra que aponta ato fora da taxonomia é erro de cadastro. */
export function lerReferencia(pasta: string = PASTA_DA_REFERENCIA): Referencia {
  const taxonomia = TaxonomiaDaAvaliacao.parse(lerJson(pasta, 'taxonomia.json'));
  const regras = RegrasDaAvaliacao.parse(lerJson(pasta, 'regras.json'));
  const codigos = new Set(taxonomia.tipos.map((t) => t.codigo));
  const foraDaTaxonomia = regras.regras.filter((r) => !codigos.has(r.tipoAto));
  if (foraDaTaxonomia.length > 0) {
    throw new Error(
      `Regras com ato fora da taxonomia: ${foraDaTaxonomia.map((r) => r.codigo).join(', ')}`,
    );
  }
  return { taxonomia, regras };
}

export const tiposDaTaxonomia = (r: Referencia): TipoDaTaxonomia[] => r.taxonomia.tipos;
export const regrasRapidas = (r: Referencia): RegraRapida[] => r.regras.regras;
