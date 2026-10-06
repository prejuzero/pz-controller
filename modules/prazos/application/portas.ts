import type { Ramo, VersaoDaTabela } from '../domain/tabela.js';
import type { Uuid } from '@pz/kernel';

/** Tipo de ato da taxonomia única (HU15): regras rápidas, IA e portal usam o mesmo código. */
export interface TipoDeAto {
  readonly codigo: string;
  readonly nome: string;
  readonly descricao: string;
  readonly sinonimos: readonly string[];
}

/** Porta: taxonomia de atos (tabela global `tipo_ato`), na transação do caso de uso. */
export interface RepositorioDeTiposDeAto<Transacao> {
  existe(transacao: Transacao, codigo: string): Promise<boolean>;
  /** `false` se o código já existe. */
  inserir(transacao: Transacao, tipo: TipoDeAto): Promise<boolean>;
  listar(transacao: Transacao): Promise<TipoDeAto[]>;
}

export interface FiltroDeVersoes {
  readonly tipoAto?: string;
  readonly ramo?: Ramo;
}

/** Porta: versões da tabela de prazos (tabela global `tabela_prazo`). */
export interface RepositorioDaTabela<Transacao> {
  proximaVersao(transacao: Transacao, tipoAto: string, ramo: Ramo): Promise<number>;
  /** `false` se o número de versão já foi usado (proposta concorrente). */
  inserir(transacao: Transacao, versao: VersaoDaTabela): Promise<boolean>;
  buscar(transacao: Transacao, id: Uuid): Promise<VersaoDaTabela | undefined>;
  /** Grava a aprovação; `false` se a versão já não era rascunho (aprovação concorrente). */
  registrarAprovacao(transacao: Transacao, versao: VersaoDaTabela): Promise<boolean>;
  listar(transacao: Transacao, filtro: FiltroDeVersoes): Promise<VersaoDaTabela[]>;
}
