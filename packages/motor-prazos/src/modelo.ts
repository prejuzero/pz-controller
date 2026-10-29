import type { CalendarioForense } from './calendario.js';
import type { DiaDesconsiderado } from './dias.js';
import type { Instant, LocalDate } from '@pz/kernel';

/**
 * Ramos com contagem própria (CLAUDE.md, seção 4.5). `juizados` é o juizado especial cível;
 * o criminal segue a contagem penal (curadoria V2, Q17: CPP, art. 798, c/c Lei 9.099/1995, art. 92).
 */
export const RAMOS = ['civel', 'juizados', 'trabalhista', 'penal', 'juizado-criminal'] as const;
export type Ramo = (typeof RAMOS)[number];

/** Meio da intimação: define publicação e início (RN03, RN04). `manual`: o advogado informa a ciência. */
export const MEIOS = ['djen', 'portal', 'manual'] as const;
export type Meio = (typeof MEIOS)[number];

/** Fora de `dias`, só há cálculo com regra específica cadastrada (CLAUDE.md, seção 4.4). */
export const UNIDADES = ['dias', 'horas', 'meses', 'anos'] as const;
export type Unidade = (typeof UNIDADES)[number];

export const CONTAGENS = ['uteis', 'corridos'] as const;
export type Contagem = (typeof CONTAGENS)[number];

/** Entes com prazo diferenciado (RN06). */
export const ENTES = ['fazenda-publica', 'ministerio-publico', 'defensoria'] as const;
export type Ente = (typeof ENTES)[number];

/**
 * Quem tem prazo em dobro naquele ato, conforme a tabela aprovada (curadoria V2, aba 9, coluna
 * "Prazo em dobro"; Q16):
 * - `entes-cpc`: Fazenda, MP e Defensoria (CPC, arts. 180, 183 e 186) e litisconsortes (art. 229).
 * - `so-defensoria`: só a Defensoria (LC 80/1994); o MP não dobra no processo penal.
 * - `fazenda-para-recorrer`: só a Fazenda, para recorrer (Decreto-Lei 779/1969, art. 1º, III).
 * - `nao-dobra`: prazo próprio do ente ou rito sem prazo diferenciado.
 * - `verificar`: sem dobro automático; o motor sugere o simples e mostra o dobro como alternativa.
 */
export const POLITICAS_DE_DOBRO = [
  'entes-cpc',
  'so-defensoria',
  'fazenda-para-recorrer',
  'nao-dobra',
  'verificar',
] as const;
export type PoliticaDeDobro = (typeof POLITICAS_DE_DOBRO)[number];

/** Prazo da tabela aprovada pelo curador (dado versionado, nunca código: ADR-007). */
export interface PrazoDaTabela {
  readonly quantidade: number;
  readonly unidade: Unidade;
  readonly contagem: Contagem;
  /** Dispositivo exato do ato. */
  readonly fundamento: string;
  /** Versão da tabela usada, gravada no prazo (ADR-007). */
  readonly versao: string;
  readonly dobro: PoliticaDeDobro;
  /** "Alerta ao advogado" da linha da tabela (V2, aba 9), repassado como aviso. */
  readonly alerta?: string;
}

export interface Condicoes {
  readonly ente?: Ente;
  /** Litisconsortes com procuradores de escritórios distintos (RN06, CPC, art. 229). */
  readonly litisconsortesComProcuradoresDistintos?: boolean;
  /** Informado pelo advogado; só autos físicos dobram por litisconsórcio (CPC, art. 229, §2º). */
  readonly autosFisicos?: boolean;
  /**
   * Processo penal com réu preso, da Lei Maria da Penha ou medida urgente (CPP, art. 798-A, I a
   * III): não suspende no fim do ano. Ausente: não informado, e o motor mostra as duas datas.
   */
  readonly excecaoDaSuspensaoPenal?: boolean;
}

/** O que o motor recebe. Datas jurídicas como LocalDate; nada de relógio (ADR-013). */
export interface EntradaDoCalculo {
  readonly ramo: Ramo;
  readonly meio: Meio;
  /** DJEN: disponibilização. Portal: envio. Manual: ciência informada pelo advogado. */
  readonly dataDeReferencia: LocalDate;
  /** Portal: dia em que a intimação foi consultada, se antes da ciência tácita (RN04). */
  readonly dataDaConsulta?: LocalDate;
  /** Ausente: não há regra legal cadastrada para o ato e o prazo fica "a confirmar". */
  readonly prazo?: PrazoDaTabela;
  readonly condicoes: Condicoes;
  /** Fuso IANA do juízo: o prazo termina às 24h do último dia nesse fuso (CPC, art. 213). */
  readonly fusoDoJuizo: string;
  readonly calendario: CalendarioForense;
}

/** Por que o motor não sugere data: o advogado informa e confirma (CLAUDE.md, seção 4.4). */
export const MOTIVOS_A_CONFIRMAR = [
  'sem-regra-legal',
  'unidade-sem-regra',
  'ramo-sem-regra',
  'dados-insuficientes',
  'calendario-esgotado',
] as const;
export type MotivoAConfirmar = (typeof MOTIVOS_A_CONFIRMAR)[number];

/**
 * Outra data possível quando falta um dado ou a regra admite leituras diferentes: o motor sugere
 * a mais cedo e mostra as demais com o fundamento (CLAUDE.md, seção 4.4).
 */
export interface Alternativa {
  readonly vencimento: LocalDate;
  readonly descricao: string;
  readonly fundamentos: readonly string[];
}

/** Memória de cálculo: toda data exibida vem com ela (CLAUDE.md, seção 4.4). */
export interface MemoriaDeCalculo {
  readonly publicacao?: LocalDate;
  readonly ciencia?: LocalDate;
  readonly inicio: LocalDate;
  readonly vencimento: LocalDate;
  /** 24h do vencimento no horário do juízo: o prazo vale até este instante, exclusive (ADR-013). */
  readonly fimDoPrazo: Instant;
  readonly fusoDoJuizo: string;
  readonly diasDesconsiderados: readonly DiaDesconsiderado[];
  readonly fundamentos: readonly string[];
  /** Datas mais tardias possíveis; a sugerida (`vencimento`) é sempre a mais cedo. */
  readonly alternativas: readonly Alternativa[];
  /** O que o advogado precisa conferir antes de confirmar (CLAUDE.md, seções 2.6 e 4.4). */
  readonly avisos: readonly string[];
  readonly versaoDoMotor: string;
  readonly versaoDaTabela: string;
}

export type ResultadoDoCalculo =
  | ({ readonly situacao: 'calculado' } & MemoriaDeCalculo)
  | {
      readonly situacao: 'a-confirmar';
      readonly motivo: MotivoAConfirmar;
      readonly detalhe: string;
      readonly fundamentos: readonly string[];
    };
