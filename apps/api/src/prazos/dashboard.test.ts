import { LocalDate, ok, Validacao, err } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { DashboardController } from './dashboard.controller.js';

import type { ContarProcessos } from '@pz/cadastro';
import type { PainelDosPrazos } from '@pz/prazos';
import type { ContarPublicacoesNovas } from '@pz/publicacoes';

// Dados FICTÍCIOS: só a composição HTTP → módulos (cada contagem é testada no módulo dono).
const contagem = {
  vencemHoje: 1,
  proximos7Dias: 2,
  vencidosNaoCumpridos: 3,
  aguardandoConfirmacao: 4,
  semCienciaConfirmada: 5,
};

describe('DashboardController (HU26)', () => {
  it('junta os contadores dos módulos, repassa o filtro e traduz erros', async () => {
    const tribunais: unknown[] = [];
    const controller = new DashboardController(
      {
        resumo: (filtro: { tribunal?: string }) =>
          Promise.resolve(filtro.tribunal === 'X' ? err(new Validacao([])) : ok(contagem)),
        linhaDoTempo: () =>
          Promise.resolve(ok([{ data: LocalDate.de(2026, 10, 30), quantidade: 2 }])),
        proximos: () => Promise.resolve(ok([{ id: 'p', diasUteisRestantes: 0 }])),
      } as unknown as PainelDosPrazos<unknown>,
      { executar: () => Promise.resolve(6) } as unknown as ContarPublicacoesNovas<unknown>,
      {
        executar: (filtro: unknown) => {
          tribunais.push(filtro);
          return Promise.resolve(7);
        },
      } as unknown as ContarProcessos<unknown>,
    );
    expect(await controller.resumo({})).toEqual({
      ...contagem,
      novasPublicacoes: 6,
      processosMonitorados: 7,
    });
    await controller.resumo({ tribunal: 'TJGO' });
    expect(tribunais).toEqual([{}, { tribunal: 'TJGO' }]);
    await expect(controller.resumo({ tribunal: 'X' })).rejects.toThrow(Validacao);
    await expect(controller.resumo({ responsavelId: 'x' })).rejects.toThrow(Validacao);
    expect(await controller.linhaDoTempo({})).toEqual({
      itens: [{ data: '2026-10-30', quantidade: 2 }],
    });
    expect(await controller.proximosPrazos({})).toEqual({
      itens: [{ id: 'p', diasUteisRestantes: 0 }],
    });
  });

  it('erro de validação da linha do tempo e dos próximos vira exceção', async () => {
    const falha = () => Promise.resolve(err(new Validacao([])));
    const controller = new DashboardController(
      { linhaDoTempo: falha, proximos: falha } as unknown as PainelDosPrazos<unknown>,
      {} as ContarPublicacoesNovas<unknown>,
      {} as ContarProcessos<unknown>,
    );
    await expect(controller.linhaDoTempo({ dias: 0 })).rejects.toThrow(Validacao);
    await expect(controller.proximosPrazos({ limite: 0 })).rejects.toThrow(Validacao);
  });
});
