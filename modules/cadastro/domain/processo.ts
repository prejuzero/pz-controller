import { AggregateRoot, err, gerarUuidV7, ok, RegraDeNegocio, tribunalDoNumero } from '@pz/kernel';

import type { Clock, EventoDominio, NumeroCnj, Ramo, Result, Uuid } from '@pz/kernel';

/**
 * Cobertura do monitoramento (RF91; Especificação, seção 5.1): `automatica` quando as fontes
 * públicas trazem as intimações; `parcial` ou `manual` quando parte delas (ou todas) só aparece no
 * painel do tribunal e o advogado precisa conferir por conta própria.
 */
export const COBERTURAS = ['automatica', 'parcial', 'manual'] as const;
export type Cobertura = (typeof COBERTURAS)[number];

/** De onde veio o processo: cadastro do advogado ou criação automática pela captura. */
export type OrigemDoProcesso = 'manual' | 'captura';

export interface EstadoDoProcesso {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  /** Só os 20 dígitos (forma canônica do NumeroCnj). */
  readonly numeroCnj: string;
  /** Sigla do tribunal deduzido do número; null quando a combinação não está na tabela. */
  readonly tribunal: string | null;
  readonly ramo: Ramo | null;
  readonly orgao: string | null;
  readonly comarca: string | null;
  readonly sigiloso: boolean;
  readonly cobertura: Cobertura;
  readonly motivoCobertura: string | null;
  readonly clienteId: Uuid | null;
}

export type ProcessoMonitorado = EventoDominio<
  'ProcessoMonitorado',
  { processoId: Uuid; numeroCnj: string; tribunal: string | null; origem: OrigemDoProcesso }
>;
/** A captura e os lembretes de conferência (RF92) dependem da cobertura. */
export type CoberturaAlterada = EventoDominio<
  'CoberturaAlterada',
  {
    processoId: Uuid;
    numeroCnj: string;
    antes: Cobertura;
    depois: Cobertura;
    motivo: string | null;
  }
>;
export type EventoDoProcesso = ProcessoMonitorado | CoberturaAlterada;
type SemEnvelope<E> = E extends EventoDoProcesso ? Pick<E, 'tipo' | 'payload'> : never;

export interface DadosDoProcesso {
  readonly tenantId: Uuid;
  readonly numero: NumeroCnj;
  readonly orgao?: string | null | undefined;
  readonly comarca?: string | null | undefined;
  readonly sigiloso?: boolean | undefined;
  readonly cobertura?: Cobertura | undefined;
  readonly motivoCobertura?: string | null | undefined;
  readonly clienteId?: Uuid | null | undefined;
  readonly origem: OrigemDoProcesso;
}

/** Campos ausentes (undefined) ficam como estão. */
export type AlteracaoDoProcesso = {
  readonly [Campo in 'orgao' | 'comarca' | 'sigiloso' | 'clienteId']?:
    EstadoDoProcesso[Campo] | undefined;
};

const motivoObrigatorio = () =>
  err(
    new RegraDeNegocio(
      'motivo-da-cobertura',
      'Informe o motivo quando a cobertura não for automática.',
    ),
  );

/** Processo monitorado pelo tenant (HU12, RF03 e RF91): único por número CNJ no tenant. */
export class Processo extends AggregateRoot<EventoDoProcesso> {
  private constructor(
    private estadoAtual: EstadoDoProcesso,
    private readonly relogio: Clock,
  ) {
    super(estadoAtual.id);
  }

  get estado(): EstadoDoProcesso {
    return this.estadoAtual;
  }

  static restaurar(estado: EstadoDoProcesso, relogio: Clock): Processo {
    return new Processo(estado, relogio);
  }

  static monitorar(dados: DadosDoProcesso, relogio: Clock): Result<Processo, RegraDeNegocio> {
    const cobertura = dados.cobertura ?? 'automatica';
    const motivo = dados.motivoCobertura ?? null;
    if (cobertura !== 'automatica' && motivo === null) return motivoObrigatorio();
    const tribunal = tribunalDoNumero(dados.numero.partes);
    const processo = new Processo(
      {
        id: gerarUuidV7(relogio),
        tenantId: dados.tenantId,
        numeroCnj: dados.numero.valor,
        tribunal: tribunal?.sigla ?? null,
        ramo: tribunal?.ramo ?? null,
        orgao: dados.orgao ?? null,
        comarca: dados.comarca ?? null,
        sigiloso: dados.sigiloso ?? false,
        cobertura,
        motivoCobertura: cobertura === 'automatica' ? null : motivo,
        clienteId: dados.clienteId ?? null,
      },
      relogio,
    );
    processo.emitir({
      tipo: 'ProcessoMonitorado',
      payload: {
        processoId: processo.id,
        numeroCnj: processo.estadoAtual.numeroCnj,
        tribunal: processo.estadoAtual.tribunal,
        origem: dados.origem,
      },
    });
    return ok(processo);
  }

  atualizar(alteracao: AlteracaoDoProcesso): void {
    const definidos = Object.fromEntries(
      Object.entries(alteracao).filter(([, valor]) => valor !== undefined),
    );
    this.estadoAtual = { ...this.estadoAtual, ...definidos };
  }

  /** Cobertura parcial ou manual exige motivo; a automática limpa o motivo. */
  alterarCobertura(cobertura: Cobertura, motivo: string | null): Result<void, RegraDeNegocio> {
    if (cobertura !== 'automatica' && motivo === null) return motivoObrigatorio();
    const antes = this.estadoAtual.cobertura;
    const motivoCobertura = cobertura === 'automatica' ? null : motivo;
    this.estadoAtual = { ...this.estadoAtual, cobertura, motivoCobertura };
    if (antes !== cobertura)
      this.emitir({
        tipo: 'CoberturaAlterada',
        payload: {
          processoId: this.id,
          numeroCnj: this.estadoAtual.numeroCnj,
          antes,
          depois: cobertura,
          motivo: motivoCobertura,
        },
      });
    return ok(undefined);
  }

  private emitir(evento: SemEnvelope<EventoDoProcesso>): void {
    this.registrarEvento({
      id: gerarUuidV7(this.relogio),
      versao: 1,
      tenantId: this.estadoAtual.tenantId,
      agregadoId: this.id,
      ocorridoEm: this.relogio.agora(),
      ...evento,
    });
  }
}
