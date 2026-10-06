import { selecionarVigente } from './tabela.js';

import type { Ramo, Unidade, VersaoDaTabela } from './tabela.js';
import type { LocalDate } from '@pz/kernel';

/**
 * Código reservado da manifestação genérica na taxonomia: usado quando o ato não tem prazo no
 * texto nem na tabela (CPC, art. 218, §3º). O número de dias vem da versão aprovada pelo curador
 * para esse código, nunca do código-fonte; sem ela, o prazo fica "a confirmar".
 */
export const CODIGO_MANIFESTACAO_GENERICA = 'manifestacao-generica';

/** Prazo fixado no próprio ato judicial (CPC, art. 218, §1º). */
export const FUNDAMENTO_PRAZO_DO_ATO = 'CPC, art. 218, §1º (prazo fixado no ato judicial)';

export interface PrazoNoTexto {
  readonly dias: number;
  readonly unidade: Unidade;
}

export interface PrazoDaTabela {
  readonly versaoId: string;
  readonly tipoAto: string;
  readonly ramo: Ramo;
  readonly versao: number;
  readonly dias: number;
  readonly unidade: Unidade;
  readonly fundamento: string;
  readonly fonteUrl: string;
}

export type AvisoDaResolucao =
  /** Ato sem versão vigente: aplicada a manifestação genérica (CPC, art. 218, §3º). */
  | 'ato-sem-tabela-usando-manifestacao-generica'
  /** Nem texto, nem tabela, nem manifestação genérica aprovada: "a confirmar" (seção 4.4). */
  | 'sem-regra-legal-cadastrada';

export interface PrazoResolvido {
  /** `null`: sem base para cálculo automático; o advogado informa a data. */
  readonly aplicado: (PrazoNoTexto & { readonly origem: 'texto' | 'tabela' }) | null;
  readonly tabela: PrazoDaTabela | null;
  readonly texto: PrazoNoTexto | null;
  readonly fundamento: string | null;
  readonly versaoTabela: number | null;
  readonly avisos: readonly AvisoDaResolucao[];
}

export interface EntradaDaResolucao {
  readonly dataDoAto: LocalDate;
  /** Versões do ato e ramo pedidos. */
  readonly versoesDoAto: readonly VersaoDaTabela[];
  /** Versões da manifestação genérica no mesmo ramo. */
  readonly versoesGenericas: readonly VersaoDaTabela[];
  readonly prazoNoTexto?: PrazoNoTexto;
}

function paraPrazoDaTabela(versao: VersaoDaTabela): PrazoDaTabela {
  const e = versao.estado;
  return {
    versaoId: e.id,
    tipoAto: e.tipoAto,
    ramo: e.ramo,
    versao: e.versao,
    dias: e.dias,
    unidade: e.unidade,
    fundamento: e.fundamento,
    fonteUrl: e.fonteUrl,
  };
}

/**
 * Prazo aplicável a um ato (HU15): o prazo fixado no texto prevalece sobre a tabela, e os dois
 * são devolvidos para exibição (CLAUDE.md, seção 4.4). A tabela vale pela vigência na data do ato.
 */
export function resolverPrazo(entrada: EntradaDaResolucao): PrazoResolvido {
  const doAto = selecionarVigente(entrada.versoesDoAto, entrada.dataDoAto);
  const generica =
    doAto === undefined
      ? selecionarVigente(entrada.versoesGenericas, entrada.dataDoAto)
      : undefined;
  const vigente = doAto ?? generica;
  const tabela = vigente === undefined ? null : paraPrazoDaTabela(vigente);
  const texto = entrada.prazoNoTexto ?? null;
  const avisos: AvisoDaResolucao[] = [];

  if (texto !== null) {
    return {
      aplicado: { ...texto, origem: 'texto' },
      tabela,
      texto,
      fundamento: FUNDAMENTO_PRAZO_DO_ATO,
      versaoTabela: tabela?.versao ?? null,
      avisos: generica === undefined ? avisos : ['ato-sem-tabela-usando-manifestacao-generica'],
    };
  }
  if (tabela === null) {
    return {
      aplicado: null,
      tabela,
      texto,
      fundamento: null,
      versaoTabela: null,
      avisos: ['sem-regra-legal-cadastrada'],
    };
  }
  if (generica !== undefined) avisos.push('ato-sem-tabela-usando-manifestacao-generica');
  return {
    aplicado: { dias: tabela.dias, unidade: tabela.unidade, origem: 'tabela' },
    tabela,
    texto,
    fundamento: tabela.fundamento,
    versaoTabela: tabela.versao,
    avisos,
  };
}
