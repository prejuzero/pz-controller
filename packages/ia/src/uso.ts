import { LocalDate, type Clock } from '@pz/kernel';

import type { PrecoDoModelo } from './configuracao.js';
import type { UsoIA } from '@pz/integracoes';

/** Uma chamada bem-sucedida a modelo, com o custo estimado pelo preço de tabela (HU21). */
export interface ChamadaDeIa {
  /** Dia no fuso de Brasília: o painel e o orçamento diário viram junto com o dia do escritório. */
  readonly dia: LocalDate;
  readonly tarefa: string;
  readonly modelo: string;
  readonly uso: UsoIA;
  readonly custoUsd: number;
}

/** Porta: uso de IA por dia, tarefa e modelo (tabela `uso_ia`); em memória nos testes. */
export interface RegistroDeUsoDeIa {
  registrar(chamada: ChamadaDeIa): Promise<void>;
  /** Custo estimado somado de todas as tarefas e modelos no dia. */
  custoNoDia(dia: LocalDate): Promise<number>;
}

const MILHAO = 1_000_000;

/**
 * Custo estimado em US$. `tokensEntrada` já inclui a escrita de cache (cobrada um pouco acima da
 * entrada pelo provedor): a estimativa fica levemente abaixo da fatura nesses casos.
 */
export function custoEstimadoUsd(preco: PrecoDoModelo, uso: UsoIA): number {
  return (
    (uso.tokensEntrada * preco.entrada +
      uso.tokensSaida * preco.saida +
      uso.tokensCacheLidos * preco.cacheLido) /
    MILHAO
  );
}

export function diaDoUso(relogio: Clock): LocalDate {
  return LocalDate.doInstante(relogio.agora(), 'America/Sao_Paulo');
}

export class RegistroDeUsoEmMemoria implements RegistroDeUsoDeIa {
  readonly chamadas: ChamadaDeIa[] = [];

  registrar(chamada: ChamadaDeIa): Promise<void> {
    this.chamadas.push(chamada);
    return Promise.resolve();
  }

  custoNoDia(dia: LocalDate): Promise<number> {
    return Promise.resolve(
      this.chamadas.filter((c) => c.dia.igual(dia)).reduce((t, c) => t + c.custoUsd, 0),
    );
  }
}

export interface AlertaDeOrcamentoDiario {
  readonly dia: LocalDate;
  readonly custoUsd: number;
  readonly orcamentoUsd: number;
}

/**
 * Registra o uso e alerta uma vez por dia (por instância) quando o custo do dia passa do
 * orçamento configurado. Não bloqueia chamadas: o bloqueio é o orçamento mensal por tarefa.
 */
export class RegistroComOrcamentoDiario implements RegistroDeUsoDeIa {
  #ultimoDiaAlertado: LocalDate | undefined;

  constructor(
    private readonly registro: RegistroDeUsoDeIa,
    private readonly orcamentoUsd: number,
    private readonly aoAlertar: (alerta: AlertaDeOrcamentoDiario) => void,
  ) {}

  async registrar(chamada: ChamadaDeIa): Promise<void> {
    await this.registro.registrar(chamada);
    if (this.#ultimoDiaAlertado?.igual(chamada.dia) === true) return;
    const custoUsd = await this.registro.custoNoDia(chamada.dia);
    if (custoUsd <= this.orcamentoUsd) return;
    this.#ultimoDiaAlertado = chamada.dia;
    this.aoAlertar({ dia: chamada.dia, custoUsd, orcamentoUsd: this.orcamentoUsd });
  }

  custoNoDia(dia: LocalDate): Promise<number> {
    return this.registro.custoNoDia(dia);
  }
}
