import { LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import {
  custoEstimadoUsd,
  RegistroComOrcamentoDiario,
  RegistroDeUsoEmMemoria,
  type AlertaDeOrcamentoDiario,
  type ChamadaDeIa,
} from './uso.js';

const HOJE = LocalDate.de(2026, 10, 8);
const AMANHA = LocalDate.de(2026, 10, 9);
const chamada = (dia: LocalDate, custoUsd: number): ChamadaDeIa => ({
  dia,
  tarefa: 'classificar-ato',
  modelo: 'claude-haiku-4-5',
  uso: { tokensEntrada: 1, tokensSaida: 1, tokensCacheLidos: 0 },
  custoUsd,
});

describe('custo estimado (HU21)', () => {
  it('soma entrada, saída e cache lido pelo preço por milhão de tokens', () => {
    const preco = { entrada: 1, saida: 5, cacheLido: 0.1 };
    expect(
      custoEstimadoUsd(preco, { tokensEntrada: 2000, tokensSaida: 300, tokensCacheLidos: 1000 }),
    ).toBeCloseTo((2000 * 1 + 300 * 5 + 1000 * 0.1) / 1_000_000, 12);
    expect(custoEstimadoUsd(preco, { tokensEntrada: 0, tokensSaida: 0, tokensCacheLidos: 0 })).toBe(
      0,
    );
  });
});

describe('orçamento diário em US$ (HU21)', () => {
  it('alerta uma vez quando o custo do dia passa do orçamento e de novo no dia seguinte', async () => {
    const base = new RegistroDeUsoEmMemoria();
    const alertas: AlertaDeOrcamentoDiario[] = [];
    const registro = new RegistroComOrcamentoDiario(base, 1, (a) => alertas.push(a));

    await registro.registrar(chamada(HOJE, 0.6));
    await registro.registrar(chamada(HOJE, 0.4)); // exatamente no orçamento: sem alerta
    expect(alertas).toEqual([]);
    await registro.registrar(chamada(HOJE, 0.5));
    await registro.registrar(chamada(HOJE, 0.5));
    expect(alertas).toEqual([{ dia: HOJE, custoUsd: 1.5, orcamentoUsd: 1 }]);

    await registro.registrar(chamada(AMANHA, 2));
    expect(alertas).toHaveLength(2);
    expect(alertas[1]).toEqual({ dia: AMANHA, custoUsd: 2, orcamentoUsd: 1 });
    expect(base.chamadas).toHaveLength(5);
    expect(await registro.custoNoDia(HOJE)).toBe(2);
  });
});
