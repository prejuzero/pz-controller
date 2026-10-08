import { LocalDate, type Clock, type UnidadeDeTrabalho } from '@pz/kernel';

/** Uso acumulado de IA num dia (Brasília), por tarefa e modelo (HU21). */
export interface LinhaDeUsoDeIa {
  readonly dia: LocalDate;
  readonly tarefa: string;
  readonly modelo: string;
  readonly chamadas: number;
  readonly tokensEntrada: number;
  readonly tokensSaida: number;
  readonly tokensCacheLidos: number;
  readonly custoUsd: number;
}

export interface ConsultaDeUsoDeIa<Transacao> {
  /** Linhas de `de` a `ate`, inclusive, em ordem de dia, tarefa e modelo. */
  porPeriodo(transacao: Transacao, de: LocalDate, ate: LocalDate): Promise<LinhaDeUsoDeIa[]>;
}

/** Tarefa que classifica cada conteúdo uma vez: chamadas dela ≈ publicações classificadas por IA. */
export const TAREFA_DE_CLASSIFICACAO = 'classificar-ato';
/** Meta de custo por publicação classificada (especificação, seção 7.5: Haiku 4.5). */
export const META_CUSTO_POR_PUBLICACAO_USD = 0.0045;
export const DIAS_MAXIMOS_DO_PAINEL = 90;

export interface PainelDeUsoDeIa {
  readonly de: LocalDate;
  readonly ate: LocalDate;
  readonly linhas: readonly LinhaDeUsoDeIa[];
  readonly custoTotalUsd: number;
  readonly classificacao: {
    readonly chamadas: number;
    /** Nulo sem nenhuma classificação por IA no período. */
    readonly custoMedioUsd: number | null;
    readonly metaUsd: number;
  };
}

/** Painel de custo de IA do administrador da plataforma (HU21): últimos `dias` até hoje. */
export class ConsultarUsoDeIa<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly consulta: ConsultaDeUsoDeIa<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(dias: number): Promise<PainelDeUsoDeIa> {
    if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAXIMOS_DO_PAINEL) {
      throw new RangeError(`Período do painel fora de 1 a ${String(DIAS_MAXIMOS_DO_PAINEL)} dias.`);
    }
    const ate = LocalDate.doInstante(this.relogio.agora(), 'America/Sao_Paulo');
    const de = ate.maisDias(-(dias - 1));
    const linhas = await this.unidade.executar((tx) => this.consulta.porPeriodo(tx, de, ate));
    const classificacoes = linhas.filter((l) => l.tarefa === TAREFA_DE_CLASSIFICACAO);
    const chamadas = soma(classificacoes, (l) => l.chamadas);
    return {
      de,
      ate,
      linhas,
      custoTotalUsd: soma(linhas, (l) => l.custoUsd),
      classificacao: {
        chamadas,
        custoMedioUsd: chamadas === 0 ? null : soma(classificacoes, (l) => l.custoUsd) / chamadas,
        metaUsd: META_CUSTO_POR_PUBLICACAO_USD,
      },
    };
  }
}

function soma(linhas: readonly LinhaDeUsoDeIa[], valor: (l: LinhaDeUsoDeIa) => number): number {
  return linhas.reduce((total, l) => total + valor(l), 0);
}
