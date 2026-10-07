import { FixedClock, gerarUuidV7, Instant, OutboxEmMemoria } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { AplicarRetencao } from '../application/retencao.js';

import type { OperacoesDeRetencao } from '../application/portas.js';
import type { TransacaoEmMemoria } from '@pz/kernel';

// Dados FICTÍCIOS.
describe('retenção (HU38)', () => {
  it('limite pelo prazo das provas; trilha antes do expurgo de cada tenant; depois os acessos', async () => {
    const TENANT = gerarUuidV7();
    const passos: string[] = [];
    const operacoes: OperacoesDeRetencao<TransacaoEmMemoria> = {
      encerradosAntesDe: (_tx, limite) => {
        passos.push(`limite ${limite.paraIso()}`);
        return Promise.resolve([TENANT]);
      },
      entrarNoTenant: () => Promise.resolve(void passos.push('tenant')),
      expurgarProvas: (_tx, _t, dias) =>
        Promise.resolve(void passos.push(`provas ${String(dias)}`)),
      expurgarAcessos: (_tx, limite) => {
        passos.push(`acessos ${limite.paraIso()}`);
        return Promise.resolve(7);
      },
    };
    const retencao = new AplicarRetencao(
      new OutboxEmMemoria(),
      operacoes,
      { registrar: (_tx, e) => Promise.resolve(void passos.push(`trilha ${e.tipo}`)) },
      new FixedClock(Instant.deIso('2031-10-07T12:00:00Z')),
      { acessosDias: 365, provasDias: 1826 },
    );
    expect(await retencao.executar()).toEqual({
      tenantsExpurgados: [TENANT],
      acessosExpurgados: 7,
    });
    expect(passos).toEqual([
      'limite 2026-10-07T12:00:00.000Z',
      'tenant',
      'trilha privacidade.provas-expurgadas',
      'provas 1826',
      'acessos 2030-10-07T12:00:00.000Z',
    ]);
  });
});
