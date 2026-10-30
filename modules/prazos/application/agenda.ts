import { calendarioDeOcorrencias, diaUtilAntes } from '@pz/motor-prazos';

import { STATUS_RECALCULAVEIS } from '../domain/prazo.js';

import { EFEITO_DO_DIA } from './prazos.js';

import type { LocalizadorDoProcesso, RepositorioDePrazos } from './portas.js';
import type { StatusDaCiencia, StatusDoPrazo } from '../domain/prazo.js';
import type { LocalDate, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

export interface SituacaoDoPrazo {
  readonly prazoId: Uuid;
  readonly processoId: Uuid;
  readonly responsavelId: Uuid | null;
  readonly status: StatusDoPrazo;
  readonly statusCiencia: StatusDaCiencia;
  readonly vencimento: LocalDate | null;
  /** Aberto ("a confirmar" ou pendente) e com vencimento: entra nos lembretes. */
  readonly lembrar: boolean;
}

export interface DataDoLembrete {
  readonly antecedencia: number;
  readonly data: LocalDate;
}

/**
 * Situação e datas dos lembretes de um prazo (HU31), no tenant corrente. As datas saem do motor
 * (`diaUtilAntes`) com o calendário do processo: o mesmo critério de dia útil do cálculo.
 */
export class AgendaDosLembretes<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly prazos: RepositorioDePrazos<Transacao>,
    private readonly localizar: LocalizadorDoProcesso,
  ) {}

  async situacao(prazoId: Uuid): Promise<SituacaoDoPrazo | undefined> {
    const prazo = await this.unidade.executar((tx) => this.prazos.buscar(tx, prazoId));
    if (prazo === undefined) return undefined;
    const e = prazo.estado;
    return {
      prazoId: e.id,
      processoId: e.processoId,
      responsavelId: e.responsavelId,
      status: e.status,
      statusCiencia: e.statusCiencia,
      vencimento: e.calculo.vencimento,
      lembrar: STATUS_RECALCULAVEIS.includes(e.status) && e.calculo.vencimento !== null,
    };
  }

  /**
   * Datas das antecedências (dias úteis antes do vencimento). Sem o processo no calendário ou
   * com o calendário esgotado, só o próprio vencimento: melhor avisar no dia que não avisar.
   */
  async datas(
    processoId: Uuid,
    vencimento: LocalDate,
    antecedencias: readonly number[],
  ): Promise<DataDoLembrete[]> {
    const maior = Math.max(0, ...antecedencias);
    const processo = await this.localizar(processoId);
    // Janela folgada: n dias úteis cabem em 3n + 30 dias corridos com feriados e recesso.
    const dias =
      processo === undefined
        ? undefined
        : await processo.diasNaoUteis(vencimento.maisDias(-(maior * 3 + 30)), vencimento);
    if (dias === undefined) return [{ antecedencia: 0, data: vencimento }];
    const calendario = calendarioDeOcorrencias(
      dias.map((d) => ({
        data: d.data,
        efeito: EFEITO_DO_DIA[d.tipo],
        motivo: d.motivo,
        atoNormativo: d.atoNormativo,
        urlAto: d.urlAto,
      })),
    );
    const datas: DataDoLembrete[] = [];
    for (const antecedencia of [...new Set(antecedencias)].sort((a, b) => b - a)) {
      const r = diaUtilAntes(vencimento, antecedencia, calendario);
      if (r.ok) datas.push({ antecedencia, data: r.valor });
    }
    // Calendário esgotado em todas: ao menos o aviso no dia.
    return datas.length > 0 ? datas : [{ antecedencia: 0, data: vencimento }];
  }
}
