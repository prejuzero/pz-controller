import { AggregateRoot, Conflito, err, gerarUuidV7, ok } from '@pz/kernel';

import type { Ramo, Unidade } from './tabela.js';
import type { Clock, EventoDominio, Instant, LocalDate, Result, Uuid } from '@pz/kernel';

export const ORIGENS_DO_PRAZO = ['djen', 'manual', 'painel'] as const;
export type OrigemDoPrazo = (typeof ORIGENS_DO_PRAZO)[number];

export const STATUS_DO_PRAZO = [
  'a-confirmar',
  'pendente',
  'cumprido',
  'vencido',
  'cancelado',
] as const;
export type StatusDoPrazo = (typeof STATUS_DO_PRAZO)[number];

export const STATUS_DA_CIENCIA = ['pendente', 'confirmada'] as const;
export type StatusDaCiencia = (typeof STATUS_DA_CIENCIA)[number];

/** Só prazos abertos acompanham o calendário: cumprido, vencido e cancelado ficam intactos. */
export const STATUS_RECALCULAVEIS: readonly StatusDoPrazo[] = ['a-confirmar', 'pendente'];

/** JSON gravado no prazo (memória e entrada do motor): dado, sem regra. */
export type Json =
  null | boolean | number | string | readonly Json[] | { readonly [chave: string]: Json };

/** Jurisdição usada no calendário e o que faltou no processo (a tela avisa). */
export interface JurisdicaoDoPrazo {
  readonly tribunal?: string;
  readonly uf?: string;
  readonly comarca?: string;
  readonly lacunas: readonly string[];
}

/**
 * Resultado do motor já traduzido para o prazo. As datas vêm do motor (ADR-007); aqui só são
 * guardadas. `situacao: 'a-confirmar'` não tem vencimento: o advogado informa.
 */
export interface CalculoDoPrazo {
  readonly situacao: 'calculado' | 'a-confirmar';
  readonly dias: number | null;
  readonly unidade: Unidade | null;
  readonly inicio: LocalDate | null;
  readonly vencimento: LocalDate | null;
  readonly fimDoPrazo: Instant | null;
  readonly fusoDoJuizo: string | null;
  readonly fundamento: string | null;
  readonly versaoMotor: string;
  readonly versaoTabela: number | null;
  /** Memória de cálculo do motor (ou o motivo do "a confirmar"), em JSON. */
  readonly memoria: Json;
}

export interface EstadoDoPrazo {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly processoId: Uuid;
  readonly publicacaoConteudoId: Uuid | null;
  readonly tipoAto: string;
  readonly ramo: Ramo | null;
  readonly calculo: CalculoDoPrazo;
  readonly vencimentoManual: boolean;
  /** Entrada do motor sem o calendário; `null` quando não há o que recalcular. */
  readonly entrada: Json;
  readonly origem: OrigemDoPrazo;
  readonly status: StatusDoPrazo;
  readonly statusCiencia: StatusDaCiencia;
  readonly responsavelId: Uuid | null;
  readonly jurisdicao: JurisdicaoDoPrazo;
  /** Entrada do cálculo (ato, meio, referência, condições): o ajuste recalcula a partir dela. */
  readonly parametros: Json;
  /** Classificação de confiança baixa ou de revisão manual: a tela destaca. */
  readonly classificacaoIncerta: boolean;
  /** Último motivo de ajuste ou cancelamento; o histórico está na trilha. */
  readonly motivoAjuste: string | null;
  readonly versaoOtimista: number;
}

export interface NovoPrazo {
  readonly processoId: Uuid;
  readonly publicacaoConteudoId: Uuid | null;
  readonly tipoAto: string;
  readonly ramo: Ramo | null;
  readonly calculo: CalculoDoPrazo;
  readonly entrada: Json;
  readonly origem: OrigemDoPrazo;
  readonly responsavelId: Uuid | null;
  readonly jurisdicao: JurisdicaoDoPrazo;
  readonly parametros: Json;
  readonly classificacaoIncerta: boolean;
}

/** O que um recálculo mudou: nada, só a memória (mesmo vencimento) ou o vencimento. */
export type EfeitoDoRecalculo = 'sem-mudanca' | 'memoria' | 'vencimento';

/** JSON com as chaves em ordem: o jsonb do banco não preserva a ordem de montagem. */
function canonico(valor: Json): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${(valor as readonly Json[]).map(canonico).join(',')}]`;
  const objeto = valor as Readonly<Record<string, Json>>;
  return `{${Object.keys(objeto)
    .sort()
    .map((chave) => `${JSON.stringify(chave)}:${canonico(objeto[chave] ?? null)}`)
    .join(',')}}`;
}

const iso = (data: LocalDate | null) => (data === null ? null : data.paraIso());

/**
 * Prazo de um ato do processo (HU16). Nasce sempre "a confirmar": o sistema sugere, o advogado
 * decide (CLAUDE.md, seção 2). Nenhuma data é calculada aqui: o cálculo chega pronto do motor.
 */
export class Prazo extends AggregateRoot {
  #estado: EstadoDoPrazo;

  private constructor(estado: EstadoDoPrazo) {
    super(estado.id);
    this.#estado = estado;
  }

  static sugerir(novo: NovoPrazo, tenantId: Uuid, relogio: Clock): Prazo {
    const prazo = new Prazo({
      ...novo,
      id: gerarUuidV7(relogio),
      tenantId,
      vencimentoManual: false,
      status: 'a-confirmar',
      statusCiencia: 'pendente',
      motivoAjuste: null,
      versaoOtimista: 1,
    });
    prazo.registrarEvento({
      id: gerarUuidV7(relogio),
      tipo: 'PrazoSugerido',
      versao: 1,
      tenantId,
      agregadoId: prazo.id,
      ocorridoEm: relogio.agora(),
      payload: {
        prazoId: prazo.id,
        processoId: novo.processoId,
        tipoAto: novo.tipoAto,
        origem: novo.origem,
        situacao: novo.calculo.situacao,
        vencimento: iso(novo.calculo.vencimento),
      },
    });
    return prazo;
  }

  static restaurar(estado: EstadoDoPrazo): Prazo {
    return new Prazo(estado);
  }

  get estado(): EstadoDoPrazo {
    return this.#estado;
  }

  /** Acompanha o calendário: aberto, calculado pelo motor e com a entrada guardada. */
  get recalculavel(): boolean {
    const e = this.#estado;
    return STATUS_RECALCULAVEIS.includes(e.status) && !e.vencimentoManual && e.entrada !== null;
  }

  /**
   * Aplica o resultado de um novo cálculo depois de uma mudança do calendário. Se o vencimento
   * muda, o prazo volta a "a confirmar", mesmo já confirmado: a data que o advogado confirmou
   * deixou de ser a sugerida, e só ele decide a nova (CLAUDE.md, seção 2).
   */
  recalcular(calculo: CalculoDoPrazo, eventoCalendarioId: Uuid, relogio: Clock): EfeitoDoRecalculo {
    const antes = this.#estado;
    if (!this.recalculavel || canonico(calculo.memoria) === canonico(antes.calculo.memoria)) {
      return 'sem-mudanca';
    }
    const mudouVencimento = iso(calculo.vencimento) !== iso(antes.calculo.vencimento);
    this.#estado = {
      ...antes,
      calculo,
      status: mudouVencimento ? 'a-confirmar' : antes.status,
      versaoOtimista: antes.versaoOtimista + 1,
    };
    if (!mudouVencimento) return 'memoria';
    this.registrarEvento({
      id: gerarUuidV7(relogio),
      tipo: 'PrazoRecalculado',
      versao: 1,
      tenantId: antes.tenantId,
      agregadoId: this.id,
      ocorridoEm: relogio.agora(),
      payload: {
        prazoId: this.id,
        processoId: antes.processoId,
        vencimentoAnterior: iso(antes.calculo.vencimento),
        vencimentoNovo: iso(calculo.vencimento),
        statusAnterior: antes.status,
        eventoCalendarioId,
      },
    } satisfies EventoDominio);
    return 'vencimento';
  }

  /** Quem agiu: vai no evento (a trilha guarda o resto). */
  #evento(tipo: string, relogio: Clock, payload: Record<string, Json>): void {
    this.registrarEvento({
      id: gerarUuidV7(relogio),
      tipo,
      versao: 1,
      tenantId: this.#estado.tenantId,
      agregadoId: this.id,
      ocorridoEm: relogio.agora(),
      payload: { prazoId: this.id, processoId: this.#estado.processoId, ...payload },
    });
  }

  #transicao(
    de: readonly StatusDoPrazo[],
    para: StatusDoPrazo,
    extra: Partial<EstadoDoPrazo> = {},
  ): Result<void, Conflito> {
    const atual = this.#estado.status;
    if (!de.includes(atual)) {
      return err(
        new Conflito('transicao-invalida', `Prazo "${atual}" não pode passar a "${para}".`),
      );
    }
    this.#estado = {
      ...this.#estado,
      ...extra,
      status: para,
      versaoOtimista: this.#estado.versaoOtimista + 1,
    };
    return ok(undefined);
  }

  /** O advogado confirma a data: "a confirmar" → pendente (CLAUDE.md, seção 2). */
  confirmar(usuarioId: Uuid, relogio: Clock): Result<void, Conflito> {
    if (this.#estado.calculo.vencimento === null) {
      return err(
        new Conflito('prazo-sem-vencimento', 'Informe o vencimento (ajuste) antes de confirmar.'),
      );
    }
    const r = this.#transicao(['a-confirmar'], 'pendente');
    if (r.ok) {
      this.#evento('PrazoConfirmado', relogio, {
        vencimento: iso(this.#estado.calculo.vencimento),
        usuarioId,
      });
    }
    return r;
  }

  /**
   * Ajuste pelo advogado, com motivo: novo cálculo do motor (ato ou dias) ou data informada por
   * ele ("definida manualmente", CLAUDE.md, seção 4.4). O status não muda: confirmar é outro passo.
   */
  ajustar(
    ajuste: {
      readonly calculo: CalculoDoPrazo;
      readonly tipoAto: string;
      readonly ramo: Ramo | null;
      readonly vencimentoManual: boolean;
      readonly entrada: Json;
      readonly parametros: Json;
    },
    motivo: string,
    usuarioId: Uuid,
    relogio: Clock,
  ): Result<void, Conflito> {
    const antes = this.#estado.calculo.vencimento;
    const atual = this.#estado.status;
    const r = this.#transicao(['a-confirmar', 'pendente'], atual, {
      ...ajuste,
      motivoAjuste: motivo,
    });
    if (r.ok) {
      this.#evento('PrazoAjustado', relogio, {
        tipoAto: ajuste.tipoAto,
        vencimentoAnterior: iso(antes),
        vencimentoNovo: iso(ajuste.calculo.vencimento),
        vencimentoManual: ajuste.vencimentoManual,
        motivo,
        usuarioId,
      });
    }
    return r;
  }

  cumprir(usuarioId: Uuid, relogio: Clock): Result<void, Conflito> {
    const r = this.#transicao(['pendente'], 'cumprido');
    if (r.ok) this.#evento('PrazoCumprido', relogio, { usuarioId });
    return r;
  }

  cancelar(motivo: string, usuarioId: Uuid, relogio: Clock): Result<void, Conflito> {
    const r = this.#transicao(['a-confirmar', 'pendente'], 'cancelado', { motivoAjuste: motivo });
    if (r.ok) this.#evento('PrazoCancelado', relogio, { motivo, usuarioId });
    return r;
  }

  /**
   * Passou o vencimento sem cumprimento (job diário). Vale também para o que nunca foi
   * confirmado: um prazo vencido não pode ficar escondido como "a confirmar".
   */
  vencer(hoje: LocalDate, relogio: Clock): boolean {
    const vencimento = this.#estado.calculo.vencimento;
    if (!vencimento?.ehAntesDe(hoje)) return false;
    const anterior = this.#estado.status;
    if (!this.#transicao(['a-confirmar', 'pendente'], 'vencido').ok) return false;
    this.#evento('PrazoVencido', relogio, {
      vencimento: iso(vencimento),
      statusAnterior: anterior,
    });
    return true;
  }
}
