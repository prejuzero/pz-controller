import { evidencia, type Evidencia } from './texto.js';

import type { PrazoCitado } from './prazo-citado.js';
import type { ResultadoDasRegras } from './regras.js';

/** Abaixo disto o resultado fica "a confirmar" (CLAUDE.md, seção 11). */
export const CONFIANCA_MINIMA = 0.85;
export const ATO_DESCONHECIDO = 'desconhecido';

/** O que a IA devolveu (já validado pelo schema) ou por que não houve resposta útil. */
export type RespostaDaIa =
  | {
      readonly tipo: 'ok';
      readonly tipoAto: string;
      readonly confianca: number;
      /** Trecho do teor, copiado literalmente, que justifica a escolha. */
      readonly trecho: string;
      readonly versaoPrompt: string;
      readonly modelo: string;
    }
  | { readonly tipo: 'invalida' }
  | { readonly tipo: 'desligada' }
  | { readonly tipo: 'sem-orcamento' };

export type SituacaoDaClassificacao = 'ok' | 'a_confirmar' | 'revisao_manual';

/**
 * Classificação de um conteúdo (uma por conteúdo, ADR-014). Diz o ato e o prazo citado no texto;
 * nunca uma data (ADR-008). "a_confirmar" e "revisao_manual" pedem decisão humana.
 */
export interface Classificacao {
  readonly origem: 'regra' | 'ia' | 'nenhuma';
  readonly situacao: SituacaoDaClassificacao;
  readonly tipoAto: string | null;
  readonly confianca: number | null;
  readonly evidencias: readonly Evidencia[];
  readonly prazoCitado: PrazoCitado | null;
  readonly regra?: { readonly codigo: string; readonly versao: number };
  readonly versaoPrompt?: string;
  readonly modelo?: string;
  readonly motivo?: 'saida-invalida' | 'ia-desligada' | 'sem-orcamento';
}

interface Entrada {
  readonly teor: string;
  /** Códigos da taxonomia única (HU15). */
  readonly taxonomia: readonly string[];
  readonly regras: ResultadoDasRegras;
  /** Ausente: a IA ainda não foi consultada. */
  readonly ia?: RespostaDaIa;
}

const regraConfiante = (r: ResultadoDasRegras) =>
  r.situacao === 'classificada' && r.confianca >= CONFIANCA_MINIMA;

/**
 * Regras rápidas primeiro; a IA só quando elas não bastam. Devolve `undefined` quando falta
 * consultar a IA. Na dúvida (confiança baixa, ato fora da taxonomia, evidência que não está no
 * texto), o resultado fica "a confirmar": o sistema sugere, o advogado decide.
 */
export function decidir(entrada: Entrada & { readonly ia: RespostaDaIa }): Classificacao;
export function decidir(entrada: Entrada): Classificacao | undefined;
export function decidir(entrada: Entrada): Classificacao | undefined {
  const { teor, taxonomia, regras, ia } = entrada;
  const prazoCitado = regras.prazoCitado ?? null;
  if (regras.situacao === 'classificada' && regraConfiante(regras)) {
    return {
      origem: 'regra',
      situacao: 'ok',
      tipoAto: regras.tipoAto,
      confianca: regras.confianca,
      evidencias: regras.evidencias,
      prazoCitado,
      regra: regras.regra,
    };
  }
  if (ia === undefined) return undefined;
  if (ia.tipo === 'invalida') {
    return {
      origem: 'ia',
      situacao: 'revisao_manual',
      tipoAto: null,
      confianca: null,
      evidencias: [],
      prazoCitado,
      motivo: 'saida-invalida',
    };
  }
  if (ia.tipo !== 'ok') {
    // Sem IA: a regra fraca (se houver) vira sugestão a confirmar.
    const motivo = ia.tipo === 'desligada' ? 'ia-desligada' : 'sem-orcamento';
    return regras.situacao === 'classificada'
      ? {
          origem: 'regra',
          situacao: 'a_confirmar',
          tipoAto: regras.tipoAto,
          confianca: regras.confianca,
          evidencias: regras.evidencias,
          prazoCitado,
          regra: regras.regra,
          motivo,
        }
      : {
          origem: 'nenhuma',
          situacao: 'a_confirmar',
          tipoAto: null,
          confianca: null,
          evidencias: [],
          prazoCitado,
          motivo,
        };
  }
  const conhecido = ia.tipoAto !== ATO_DESCONHECIDO && taxonomia.includes(ia.tipoAto);
  const inicio = ia.trecho.length === 0 ? -1 : teor.indexOf(ia.trecho);
  const evidencias = inicio < 0 ? [] : [evidencia(teor, inicio, inicio + ia.trecho.length)];
  const confiavel = conhecido && ia.confianca >= CONFIANCA_MINIMA && evidencias.length > 0;
  return {
    origem: 'ia',
    situacao: confiavel ? 'ok' : 'a_confirmar',
    tipoAto: conhecido ? ia.tipoAto : null,
    confianca: ia.confianca,
    evidencias,
    prazoCitado,
    versaoPrompt: ia.versaoPrompt,
    modelo: ia.modelo,
  };
}
