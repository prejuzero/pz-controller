import { ErroLimiteExcedido } from './erros.js';

/**
 * Rate limit por adaptador (ADR-005): token bucket com capacidade de um segundo de cota, então
 * nenhum minuto passa muito da cota declarada no descritor. A implementação no Redis é
 * compartilhada por todas as instâncias; a em memória serve para testes e para uma instância só.
 */
export interface LimitadorDeTaxa {
  /** Espera a vez da chamada; desiste com `ErroLimiteExcedido` depois de `esperaMaximaMs`. */
  aguardarVez(chave: string, porMinuto: number, sinal?: AbortSignal): Promise<void>;
}

/** Quanto esperar (ms) pela próxima ficha; 0 = ficha consumida agora. */
export type Tentativa = (chave: string, capacidade: number, fichasPorMs: number) => Promise<number>;

function parametros(porMinuto: number): { capacidade: number; fichasPorMs: number } {
  if (!Number.isInteger(porMinuto) || porMinuto <= 0) {
    throw new Error(`Limite por minuto inválido: ${String(porMinuto)}`);
  }
  return { capacidade: Math.max(1, Math.ceil(porMinuto / 60)), fichasPorMs: porMinuto / 60_000 };
}

function esperar(ms: number, sinal?: AbortSignal): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    if (sinal?.aborted === true) {
      rejeitar(sinal.reason as Error);
      return;
    }
    const temporizador = setTimeout(() => {
      sinal?.removeEventListener('abort', abortar);
      resolver();
    }, ms);
    const abortar = () => {
      clearTimeout(temporizador);
      rejeitar(sinal?.reason as Error);
    };
    sinal?.addEventListener('abort', abortar, { once: true });
  });
}

export abstract class LimitadorBase implements LimitadorDeTaxa {
  constructor(private readonly esperaMaximaMs: number) {}

  protected abstract tentar: Tentativa;

  async aguardarVez(chave: string, porMinuto: number, sinal?: AbortSignal): Promise<void> {
    const { capacidade, fichasPorMs } = parametros(porMinuto);
    let esperado = 0;
    for (;;) {
      const espera = await this.tentar(chave, capacidade, fichasPorMs);
      if (espera === 0) return;
      if (esperado + espera > this.esperaMaximaMs) {
        throw new ErroLimiteExcedido(`cota local de ${String(porMinuto)}/min esgotada`, chave, {
          repetirAposMs: espera,
        });
      }
      await esperar(espera, sinal);
      esperado += espera;
    }
  }
}

export class LimitadorEmMemoria extends LimitadorBase {
  readonly #baldes = new Map<string, { fichas: number; em: number }>();

  constructor(opcoes: { readonly esperaMaximaMs?: number } = {}) {
    super(opcoes.esperaMaximaMs ?? 30_000);
  }

  protected tentar: Tentativa = (chave, capacidade, fichasPorMs) => {
    const agora = performance.now();
    const balde = this.#baldes.get(chave) ?? { fichas: capacidade, em: agora };
    balde.fichas = Math.min(capacidade, balde.fichas + (agora - balde.em) * fichasPorMs);
    balde.em = agora;
    this.#baldes.set(chave, balde);
    if (balde.fichas >= 1) {
      balde.fichas -= 1;
      return Promise.resolve(0);
    }
    return Promise.resolve(Math.ceil((1 - balde.fichas) / fichasPorMs));
  };
}
