import { LocalDate, ok } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { processoNoCalendario } from './processo.js';

import type { ConsultarProcesso } from '@pz/cadastro';
import type { ConsultarAnosSemCalendario, ConsultarDiasNaoUteis } from '@pz/calendario';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: só a composição cadastro + calendario do processo visto pelo cálculo.
const PROCESSO = '01a10e00-0000-7000-8000-0000000a0001' as Uuid;
const processos = {
  executar: (id: Uuid) =>
    Promise.resolve(
      id === PROCESSO
        ? ok({ tribunal: 'TJGO', comarca: 'Comarca Fictícia', ramo: 'estadual' })
        : { ok: false as const, erro: new Error('não encontrado') },
    ),
} as unknown as Pick<ConsultarProcesso<unknown>, 'executar'>;
const dias = {
  diasNaoUteis: () =>
    Promise.resolve([
      {
        data: LocalDate.de(2030, 8, 14),
        tipo: 'feriado',
        motivo: 'FICTÍCIO',
        fonte: { atoNormativo: 'FICTÍCIO: Portaria 1', urlAto: 'https://exemplo.invalid' },
      },
    ]),
} as unknown as Pick<ConsultarDiasNaoUteis<unknown>, 'diasNaoUteis'>;
const anos = {
  executar: (lista: readonly number[]) => Promise.resolve(lista.filter((a) => a > 2030)),
} as unknown as Pick<ConsultarAnosSemCalendario<unknown>, 'executar'>;

describe('processo no calendário (API)', () => {
  it('monta jurisdição, dias não úteis e anos sem calendário; processo de fora é undefined', async () => {
    const localizar = processoNoCalendario(processos, dias, anos);
    const processo = await localizar(PROCESSO);
    expect(processo?.ramoDoTribunal).toBe('estadual');
    expect(
      await processo?.diasNaoUteis(LocalDate.de(2030, 8, 1), LocalDate.de(2030, 8, 31)),
    ).toEqual([expect.objectContaining({ tipo: 'feriado', atoNormativo: 'FICTÍCIO: Portaria 1' })]);
    expect(await processo?.anosSemCalendario?.([2030, 2031])).toEqual([2031]);
    expect(await localizar('01a10e00-0000-7000-8000-0000000a0009' as Uuid)).toBeUndefined();
    // Sem a consulta de anos, o processo não oferece a porta (o cálculo não avisa).
    const semAnos = await processoNoCalendario(processos, dias)(PROCESSO);
    expect(semAnos !== undefined && 'anosSemCalendario' in semAnos).toBe(false);
  });
});
