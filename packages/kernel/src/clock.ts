import { Instant } from './instant.js';
import { LocalDate } from './local-date.js';

/** Fuso padrão do sistema (ADR-013). O fim de prazo usa o fuso do juízo, não este. */
export const FUSO_PADRAO = 'America/Sao_Paulo';

/**
 * Porta do relógio (ADR-013): o domínio nunca lê o relógio do sistema diretamente,
 * para que todo cálculo dependente de "agora" seja determinístico nos testes.
 */
export interface Clock {
  agora(): Instant;
}

export class SystemClock implements Clock {
  agora(): Instant {
    return Instant.deEpochMs(Date.now());
  }
}

/** Relógio controlado, para testes. */
export class FixedClock implements Clock {
  constructor(private atual: Instant) {}

  agora(): Instant {
    return this.atual;
  }

  definir(instante: Instant): void {
    this.atual = instante;
  }

  avancarMs(ms: number): void {
    this.atual = this.atual.maisMs(ms);
  }
}

/** Data civil de hoje no fuso informado (padrão: America/Sao_Paulo). */
export function hoje(relogio: Clock, fuso: string = FUSO_PADRAO): LocalDate {
  return LocalDate.doInstante(relogio.agora(), fuso);
}
