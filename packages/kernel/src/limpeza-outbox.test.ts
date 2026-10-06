import { describe, expect, it } from 'vitest';

import { FixedClock } from './clock.js';
import { Instant } from './instant.js';
import { limparOutbox } from './outbox.js';

import type { LimpezaDoOutbox, UnidadeDeTrabalho } from './outbox.js';

const DIA_MS = 24 * 3600 * 1000;
const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));

/** Registros com o instante de publicação (eventos) ou de processamento (deduplicação). */
class LimpezaFalsa implements LimpezaDoOutbox<string> {
  readonly transacoes: string[] = [];
  constructor(
    public eventos: Instant[],
    public processados: Instant[],
  ) {}

  removerPublicadosAntesDe(transacao: string, limite: Instant, lote: number): Promise<number> {
    this.transacoes.push(transacao);
    const removidos = this.eventos.filter((em) => em.ehAntesDe(limite)).slice(0, lote);
    this.eventos = this.eventos.filter((em) => !removidos.includes(em));
    return Promise.resolve(removidos.length);
  }

  removerProcessadosAntesDe(transacao: string, limite: Instant, lote: number): Promise<number> {
    this.transacoes.push(transacao);
    const removidos = this.processados.filter((em) => em.ehAntesDe(limite)).slice(0, lote);
    this.processados = this.processados.filter((em) => !removidos.includes(em));
    return Promise.resolve(removidos.length);
  }
}

let contador = 0;
const unidade: UnidadeDeTrabalho<string> = {
  executar: (trabalho) => trabalho(`tx-${String(++contador)}`),
};

const diasAtras = (dias: number) => relogio.agora().maisMs(-dias * DIA_MS);

describe('limpeza do outbox', () => {
  it('remove só o que é mais antigo que a retenção, em lotes de transações curtas', async () => {
    const limpeza = new LimpezaFalsa(
      [diasAtras(40), diasAtras(31), diasAtras(30.5), diasAtras(29), diasAtras(1)],
      [diasAtras(35), diasAtras(29)],
    );
    contador = 0;

    const resultado = await limparOutbox(unidade, limpeza, relogio, {
      retencaoMs: 30 * DIA_MS,
      lote: 2,
    });

    expect(resultado).toEqual({ eventos: 3, processados: 1 });
    expect(limpeza.eventos).toEqual([diasAtras(29), diasAtras(1)]);
    expect(limpeza.processados).toEqual([diasAtras(29)]);
    // 3 eventos em lotes de 2: 2 + 1 (lote incompleto encerra); 1 processado: 1 lote.
    expect(limpeza.transacoes).toEqual(['tx-1', 'tx-2', 'tx-3']);
  });

  it('o limite é exatamente a retenção: o que tem 30 dias completos ainda fica', async () => {
    const limpeza = new LimpezaFalsa([diasAtras(30)], []);
    expect(
      await limparOutbox(unidade, limpeza, relogio, { retencaoMs: 30 * DIA_MS, lote: 10 }),
    ).toEqual({ eventos: 0, processados: 0 });
  });

  it('lote cheio continua até esvaziar', async () => {
    const limpeza = new LimpezaFalsa([diasAtras(40), diasAtras(41)], []);
    contador = 0;
    expect(
      await limparOutbox(unidade, limpeza, relogio, { retencaoMs: 30 * DIA_MS, lote: 1 }),
    ).toEqual({ eventos: 2, processados: 0 });
    // 1 + 1 + 0 (vazio encerra) e 0 processados.
    expect(limpeza.transacoes).toHaveLength(4);
  });

  it('recusa retenção e lote não positivos', async () => {
    const limpeza = new LimpezaFalsa([], []);
    await expect(
      limparOutbox(unidade, limpeza, relogio, { retencaoMs: 0, lote: 10 }),
    ).rejects.toThrow('retenção');
    await expect(
      limparOutbox(unidade, limpeza, relogio, { retencaoMs: DIA_MS, lote: 0 }),
    ).rejects.toThrow('lote');
  });
});
