import type { CalendarioForense } from './calendario.js';
import type { DiaDesconsiderado } from './dias.js';
import type { LocalDate } from '@pz/kernel';

/** Ramos com contagem própria (CLAUDE.md, seção 4.5). */
export const RAMOS = ['civel', 'juizados', 'trabalhista', 'penal'] as const;
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

/** Prazo da tabela aprovada pelo curador (dado versionado, nunca código: ADR-007). */
export interface PrazoDaTabela {
  readonly quantidade: number;
  readonly unidade: Unidade;
  readonly contagem: Contagem;
  /** Dispositivo exato do ato. */
  readonly fundamento: string;
  /** Versão da tabela usada, gravada no prazo (ADR-007). */
  readonly versao: string;
  /** A tabela marca o prazo como próprio do ente: não dobra (CPC, arts. 180, 183 e 186). */
  readonly proprioDoEnte?: boolean;
}

export interface Condicoes {
  readonly ente?: Ente;
  /** Litisconsortes com procuradores de escritórios distintos (RN06, CPC, art. 229). */
  readonly litisconsortesComProcuradoresDistintos?: boolean;
  /** Informado pelo advogado; só autos físicos dobram por litisconsórcio (CPC, art. 229, §2º). */
  readonly autosFisicos?: boolean;
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

/** Memória de cálculo: toda data exibida vem com ela (CLAUDE.md, seção 4.4). */
export interface MemoriaDeCalculo {
  readonly publicacao?: LocalDate;
  readonly ciencia?: LocalDate;
  readonly inicio: LocalDate;
  readonly vencimento: LocalDate;
  readonly diasDesconsiderados: readonly DiaDesconsiderado[];
  readonly fundamentos: readonly string[];
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
