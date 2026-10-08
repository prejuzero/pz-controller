import { z } from 'zod';

import { motivoDaRecusa } from '../domain/padrao-seguro.js';
import { classificarPorRegras } from '../domain/regras.js';

import type { RegraRapida, ResultadoDasRegras } from '../domain/regras.js';
import type { UnidadeDeTrabalho } from '@pz/kernel';

/** Porta: regras vigentes (maior versão ativa de cada código). */
export interface RepositorioDeRegras<Transacao> {
  vigentes(transacao: Transacao): Promise<RegraRapida[]>;
}

const Regra = z.object({
  codigo: z.string().min(1),
  versao: z.number().int().min(1),
  tipoAto: z.string().min(1),
  padroes: z
    .array(
      z.string().superRefine((padrao, ctx) => {
        const motivo = motivoDaRecusa(padrao);
        if (motivo !== undefined) ctx.addIssue({ code: 'custom', message: motivo });
      }),
    )
    .min(1),
  confianca: z.number().min(0).max(1),
});

/** Regras lidas do banco, validadas: padrão inválido ou sujeito a ReDoS lança (nunca é ignorado em silêncio). */
export function regrasValidas(regras: readonly RegraRapida[]): RegraRapida[] {
  return z.array(Regra).parse(regras);
}

/**
 * Primeiro elo da classificação (HU20): regras rápidas, sem IA. Regra mal cadastrada lança (o
 * erro aparece no job e no alerta): nunca é ignorada em silêncio. A IA (HU21) entra quando o
 * resultado for "nenhuma" ou de baixa confiança.
 */
export class ClassificarPorRegras<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly regras: RepositorioDeRegras<Transacao>,
  ) {}

  async executar(teor: string): Promise<ResultadoDasRegras> {
    const regras = await this.unidade.executar((tx) => this.regras.vigentes(tx));
    return classificarPorRegras(teor, regrasValidas(regras));
  }
}
