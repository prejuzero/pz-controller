import type { SaudeAdaptador } from './canonicos.js';
import type { Clock, Instant } from '@pz/kernel';

export interface SituacaoAdaptador {
  readonly adaptador: string;
  readonly estado: SaudeAdaptador['estado'];
  readonly ultimoSucesso?: Instant;
  readonly ultimaFalha?: Instant;
  /** Mensagem do último erro (sem dados do processo: vem da classificação do adaptador). */
  readonly erro?: string;
}

/**
 * Situação de cada adaptador nesta instância, alimentada pela resiliência: o estado segue o
 * circuit breaker (fechado = operacional, meio-aberto = degradado, aberto = indisponível).
 */
export class MonitorDeSaude {
  readonly #situacoes = new Map<string, SituacaoAdaptador>();

  constructor(private readonly relogio: Clock) {}

  #atual(adaptador: string): SituacaoAdaptador {
    return this.#situacoes.get(adaptador) ?? { adaptador, estado: 'operacional' };
  }

  sucesso(adaptador: string): void {
    this.#situacoes.set(adaptador, {
      ...this.#atual(adaptador),
      ultimoSucesso: this.relogio.agora(),
    });
  }

  falha(adaptador: string, erro: string): void {
    this.#situacoes.set(adaptador, {
      ...this.#atual(adaptador),
      ultimaFalha: this.relogio.agora(),
      erro,
    });
  }

  estado(adaptador: string, estado: SaudeAdaptador['estado']): void {
    this.#situacoes.set(adaptador, { ...this.#atual(adaptador), estado });
  }

  situacao(): SituacaoAdaptador[] {
    return [...this.#situacoes.values()].sort((a, b) => a.adaptador.localeCompare(b.adaptador));
  }
}
