import type { JurisdicaoDoPrazo, Prazo, StatusDoPrazo } from '../domain/prazo.js';
import type { Ramo, VersaoDaTabela } from '../domain/tabela.js';
import type { LocalDate, Uuid } from '@pz/kernel';

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

/** Tipos de dia do calendário forense (módulo calendario), com o ato que os fundamenta. */
export const TIPOS_DE_DIA = ['feriado', 'recesso', 'portaria', 'indisponibilidade'] as const;
export type TipoDeDia = (typeof TIPOS_DE_DIA)[number];

export interface DiaDoCalendario {
  readonly data: LocalDate;
  readonly tipo: TipoDeDia;
  readonly motivo: string;
  readonly atoNormativo: string;
  readonly urlAto: string;
}

/** O processo visto pelo cálculo: ramo do tribunal (cadastro), jurisdição e fuso (calendario). */
export interface ProcessoNoCalendario {
  /** Ramo da Justiça do tribunal (kernel, cnj): `trabalho`, `estadual`, `federal`... */
  readonly ramoDoTribunal: string | null;
  readonly jurisdicao: Omit<JurisdicaoDoPrazo, 'lacunas'>;
  readonly lacunas: readonly string[];
  readonly fuso: { readonly fuso: string; readonly outrosFusos: boolean };
  /** Dias cadastrados sem contagem no período (inclusivo), na jurisdição do processo. */
  diasNaoUteis(inicio: LocalDate, fim: LocalDate): Promise<readonly DiaDoCalendario[]>;
}

/**
 * Porta: o processo do tenant corrente, montado na composição pelas APIs públicas do cadastro e
 * do calendario. `undefined` quando o processo não existe ou é de outro tenant.
 */
export type LocalizadorDoProcesso = (processoId: Uuid) => Promise<ProcessoNoCalendario | undefined>;

/** Onde e quando o calendário mudou (evento CalendarioAlterado). */
export interface AlcanceDaAlteracao {
  readonly abrangencia: 'nacional' | 'uf' | 'municipio' | 'tribunal' | 'comarca';
  readonly uf?: string;
  readonly tribunal?: string;
  readonly comarca?: string;
  readonly inicio: LocalDate;
  readonly fim: LocalDate;
}

/** Porta: prazos do tenant da transação (tabela `prazo`, RLS). */
export interface RepositorioDePrazos<Transacao> {
  inserir(transacao: Transacao, prazo: Prazo): Promise<void>;
  buscar(transacao: Transacao, id: Uuid): Promise<Prazo | undefined>;
  /** Grava se a versão otimista ainda é `versaoLida`; `false` se outro alterou antes. */
  atualizar(transacao: Transacao, prazo: Prazo, versaoLida: number): Promise<boolean>;
  /**
   * Abertos e calculados pelo motor cuja jurisdição o evento alcança e cujo intervalo
   * (referência até vencimento) cruza o período, em ordem de id, a partir de `depoisDe`.
   */
  afetados(
    transacao: Transacao,
    alcance: AlcanceDaAlteracao,
    depoisDe: Uuid | null,
    limite: number,
  ): Promise<Prazo[]>;
  /** Como sistema (sem RLS): tenants com algum prazo afetado. */
  tenantsAfetados(transacao: Transacao, alcance: AlcanceDaAlteracao): Promise<Uuid[]>;
  /** Por vencimento (sem data por último) e id, depois do cursor. */
  listar(transacao: Transacao, filtro: FiltroDePrazos): Promise<Prazo[]>;
  /** Já há prazo da publicação no tenant (geração idempotente). */
  existeDaPublicacao(transacao: Transacao, conteudoId: Uuid): Promise<boolean>;
  /** Abertos com vencimento antes de `hoje`, por id. */
  vencidos(transacao: Transacao, hoje: LocalDate, limite: number): Promise<Prazo[]>;
  /** Como sistema (sem RLS): tenants com prazo aberto vencido antes de `hoje`. */
  tenantsComVencidos(transacao: Transacao, hoje: LocalDate): Promise<Uuid[]>;
}

export interface FiltroDePrazos {
  readonly status?: StatusDoPrazo;
  readonly processoId?: Uuid;
  readonly responsavelId?: Uuid;
  readonly depoisDe?: { readonly vencimento: LocalDate | null; readonly id: Uuid };
  readonly limite: number;
}

/** O que a classificação (HU21) disse do conteúdo, nunca uma data (ADR-008). */
export interface ClassificacaoDoConteudo {
  readonly tipoAto: string | null;
  readonly situacao: 'ok' | 'a_confirmar' | 'revisao_manual';
  readonly confianca: number | null;
  readonly prazoCitado: {
    readonly quantidade: number;
    readonly unidade: 'dias' | 'dias-uteis' | 'horas' | 'meses' | 'anos';
    readonly divergente: boolean;
  } | null;
}

/** A publicação como chegou ao tenant corrente (publicacoes, ADR-014). */
export interface DestinatarioDaPublicacao {
  readonly processoId: Uuid | null;
  readonly oabId: Uuid | null;
  readonly dataDisponibilizacao: LocalDate;
}

/** Portas da geração automática (HU24), compostas nas apps pelas APIs dos outros módulos. */
export interface FontesDaGeracao {
  classificacao(conteudoId: Uuid): Promise<ClassificacaoDoConteudo | undefined>;
  destinatario(conteudoId: Uuid): Promise<DestinatarioDaPublicacao | undefined>;
  /** Usuário do advogado dono da OAB no tenant corrente. */
  responsavelDaOab(oabId: Uuid): Promise<Uuid | undefined>;
}
