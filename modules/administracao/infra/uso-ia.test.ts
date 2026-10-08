import { FixedClock, Instant, LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { ConsultarUsoDeIa, META_CUSTO_POR_PUBLICACAO_USD } from '../application/uso-ia.js';

import { UsoDeIaEmMemoria } from './uso-ia-em-memoria.js';

import type { LinhaDeUsoDeIa } from '../application/uso-ia.js';

const unidade = { executar: <T>(trabalho: (tx: unknown) => Promise<T>) => trabalho(undefined) };
// 01h UTC de 09/10 ainda é 08/10 em Brasília: hoje é 08/10.
const relogio = new FixedClock(Instant.deIso('2026-10-09T01:00:00Z'));
const linha = (
  dia: LocalDate,
  tarefa: string,
  modelo: string,
  chamadas: number,
  custoUsd: number,
): LinhaDeUsoDeIa => ({
  dia,
  tarefa,
  modelo,
  chamadas,
  tokensEntrada: chamadas * 1000,
  tokensSaida: chamadas * 100,
  tokensCacheLidos: 0,
  custoUsd,
});

describe('painel de custo de IA (HU21)', () => {
  it('soma o período até hoje (Brasília) e compara o custo médio por publicação à meta', async () => {
    const uso = new UsoDeIaEmMemoria();
    uso.linhas.push(
      linha(LocalDate.de(2026, 10, 8), 'resumir-publicacao', 'claude-haiku-4-5', 2, 0.002),
      linha(LocalDate.de(2026, 10, 8), 'classificar-ato', 'claude-haiku-4-5', 3, 0.009),
      linha(LocalDate.de(2026, 10, 2), 'classificar-ato', 'claude-sonnet-5-5', 1, 0.011),
      // Fora da janela de 7 dias (02/10 a 08/10).
      linha(LocalDate.de(2026, 10, 1), 'classificar-ato', 'claude-haiku-4-5', 50, 5),
    );
    const painel = await new ConsultarUsoDeIa(unidade, uso, relogio).executar(7);

    expect(painel.de).toEqual(LocalDate.de(2026, 10, 2));
    expect(painel.ate).toEqual(LocalDate.de(2026, 10, 8));
    expect(painel.linhas.map((l) => [l.dia.paraIso(), l.tarefa])).toEqual([
      ['2026-10-02', 'classificar-ato'],
      ['2026-10-08', 'classificar-ato'],
      ['2026-10-08', 'resumir-publicacao'],
    ]);
    expect(painel.custoTotalUsd).toBeCloseTo(0.022, 9);
    expect(painel.classificacao.chamadas).toBe(4);
    expect(painel.classificacao.custoMedioUsd).toBeCloseTo(0.005, 9);
    expect(painel.classificacao.metaUsd).toBe(META_CUSTO_POR_PUBLICACAO_USD);
  });

  it('sem classificação no período, custo médio nulo; período fora de 1 a 90 dias é recusado', async () => {
    const consultar = new ConsultarUsoDeIa(unidade, new UsoDeIaEmMemoria(), relogio);
    const painel = await consultar.executar(1);
    expect(painel.de).toEqual(painel.ate);
    expect(painel.classificacao.custoMedioUsd).toBeNull();
    expect(painel.custoTotalUsd).toBe(0);
    for (const dias of [0, 91, 1.5]) {
      await expect(consultar.executar(dias)).rejects.toBeInstanceOf(RangeError);
    }
  });
});
