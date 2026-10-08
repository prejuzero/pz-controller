import { Banco } from '@pz/db';
import { subirBancoDeTeste } from '@pz/db/teste';
import { FixedClock, Instant, LocalDate } from '@pz/kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConsultarUsoDeIa } from '../application/uso-ia.js';

import { UsoDeIaPostgres } from './uso-ia-postgres.js';

import type { BancoDeTeste } from '@pz/db/teste';
import type { ChamadaDeIa } from '@pz/ia';

const DIA = LocalDate.de(2026, 10, 8);
let postgres: BancoDeTeste;
let banco: Banco;

beforeAll(async () => {
  postgres = await subirBancoDeTeste();
  await postgres.migrar();
  banco = new Banco({ url: postgres.url('pz_app'), maxConexoes: 5 });
});

afterAll(async () => {
  await banco.encerrar();
  await postgres.parar();
});

const chamada = (dia: LocalDate, modelo: string, custoUsd: number): ChamadaDeIa => ({
  dia,
  tarefa: 'classificar-ato',
  modelo,
  uso: { tokensEntrada: 1000, tokensSaida: 100, tokensCacheLidos: 500 },
  custoUsd,
});

describe('uso de IA no PostgreSQL (HU21)', () => {
  it('acumula chamadas concorrentes sem tenant (pz_app) e o painel lê o período', async () => {
    const uso = new UsoDeIaPostgres();
    const registro = uso.registro({
      executar: (trabalho) => banco.executarSemTenant('uso de IA da plataforma (teste)', trabalho),
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        registro.registrar(chamada(DIA, 'claude-haiku-4-5', 0.0015)),
      ),
    );
    await registro.registrar(chamada(DIA, 'claude-sonnet-5-5', 0.003));
    await registro.registrar(chamada(DIA.maisDias(-40), 'claude-haiku-4-5', 1));

    expect(await registro.custoNoDia(DIA)).toBeCloseTo(0.018, 6);

    const painel = await new ConsultarUsoDeIa(
      {
        executar: (trabalho) => banco.executarSemTenant('painel de uso de IA (teste)', trabalho),
      },
      uso,
      new FixedClock(Instant.deIso('2026-10-08T15:00:00Z')),
    ).executar(30);
    expect(painel.linhas).toEqual([
      {
        dia: DIA,
        tarefa: 'classificar-ato',
        modelo: 'claude-haiku-4-5',
        chamadas: 10,
        tokensEntrada: 10_000,
        tokensSaida: 1000,
        tokensCacheLidos: 5000,
        custoUsd: 0.015,
      },
      {
        dia: DIA,
        tarefa: 'classificar-ato',
        modelo: 'claude-sonnet-5-5',
        chamadas: 1,
        tokensEntrada: 1000,
        tokensSaida: 100,
        tokensCacheLidos: 500,
        custoUsd: 0.003,
      },
    ]);
    expect(painel.classificacao.chamadas).toBe(11);
  });
});
