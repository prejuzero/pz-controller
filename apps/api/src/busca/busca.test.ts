import { err, ok, Validacao } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { BuscaController } from './busca.controller.js';

import type { Buscar } from '@pz/busca';

// Só a ligação HTTP → módulo busca (a regra é testada no módulo).
describe('BuscaController (HU28)', () => {
  it('repassa o corpo e transforma erro de validação em exceção', async () => {
    const corpos: unknown[] = [];
    const resposta = (corpo: unknown) => {
      corpos.push(corpo);
      return Promise.resolve(
        (corpo as { erro?: boolean }).erro === true ? err(new Validacao([])) : ok({ itens: [] }),
      );
    };
    const controller = new BuscaController({
      prazos: resposta,
      publicacoes: resposta,
      rapida: resposta,
    } as unknown as Buscar);
    expect(await controller.prazos({ tribunal: 'TJGO' })).toEqual({ itens: [] });
    expect(await controller.publicacoes({ palavraChave: 'x' })).toEqual({ itens: [] });
    const comItem = new BuscaController({
      publicacoes: () =>
        Promise.resolve(
          ok({
            itens: [
              {
                id: 'p',
                recebidaEm: new Date('2026-10-30T12:00:00Z'),
                capturadoEm: new Date('2026-10-30T12:00:00Z'),
                lidaEm: null,
                oabId: 'interno',
              },
            ],
          }),
        ),
    } as unknown as Buscar);
    const { itens } = await comItem.publicacoes({});
    expect(itens[0]).toMatchObject({ id: 'p', recebidaEm: '2026-10-30T12:00:00.000Z' });
    expect(itens[0]).not.toHaveProperty('oabId');
    expect(await controller.rapida({ texto: 'xy' })).toEqual({ itens: [] });
    for (const rota of ['prazos', 'publicacoes', 'rapida'] as const) {
      await expect(controller[rota]({ erro: true })).rejects.toThrow(Validacao);
    }
    expect(corpos).toHaveLength(6);
  });
});
