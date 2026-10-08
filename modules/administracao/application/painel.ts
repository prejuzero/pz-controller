import { consolidar, falhasNovas } from '../domain/integracoes.js';

import type { FalhaDeIntegracao, IntegracaoConsolidada, Retrato } from '../domain/integracoes.js';
import type { SituacaoAdaptador } from '@pz/integracoes';
import type { Clock } from '@pz/kernel';

/** Onde os retratos e o histórico curto de falhas ficam (telemetria, não fonte de verdade). */
export interface ArmazemDoPainel {
  retratos(): Promise<Retrato[]>;
  gravar(retrato: Retrato, falhasNovas: readonly FalhaDeIntegracao[]): Promise<void>;
  /** Mais recentes primeiro. */
  falhas(limite: number): Promise<FalhaDeIntegracao[]>;
}

/** Contagem dos jobs por fila do catálogo, com a DLQ (HU39; reprocessar é pela rota auditada). */
export interface ResumoDeFila {
  readonly fila: string;
  readonly aguardando: number;
  readonly ativos: number;
  readonly atrasados: number;
  readonly falhos: number;
  readonly mortos: number;
}

export interface ContadorDeFilas {
  resumo(): Promise<ResumoDeFila[]>;
}

export const LIMITE_DO_HISTORICO = 50;

/** No worker: grava o retrato da instância e as falhas novas desde o anterior. */
export class PublicarSituacaoDasIntegracoes {
  constructor(
    private readonly armazem: ArmazemDoPainel,
    private readonly relogio: Clock,
  ) {}

  async executar(instancia: string, situacoes: readonly SituacaoAdaptador[]): Promise<void> {
    const anterior = (await this.armazem.retratos()).find((r) => r.instancia === instancia);
    const retrato: Retrato = { instancia, em: this.relogio.agora(), situacoes };
    await this.armazem.gravar(retrato, falhasNovas(anterior, retrato));
  }
}

export interface PainelDeIntegracoes {
  readonly adaptadores: readonly IntegracaoConsolidada[];
  readonly falhas: readonly FalhaDeIntegracao[];
}

export class ConsultarIntegracoes {
  constructor(
    private readonly armazem: ArmazemDoPainel,
    private readonly relogio: Clock,
  ) {}

  async executar(): Promise<PainelDeIntegracoes> {
    const [retratos, falhas] = await Promise.all([
      this.armazem.retratos(),
      this.armazem.falhas(LIMITE_DO_HISTORICO),
    ]);
    return { adaptadores: consolidar(retratos, this.relogio.agora()), falhas };
  }
}

export class ConsultarFilas {
  constructor(private readonly contador: ContadorDeFilas) {}

  executar(): Promise<ResumoDeFila[]> {
    return this.contador.resumo();
  }
}
