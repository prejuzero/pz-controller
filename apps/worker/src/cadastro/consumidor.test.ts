import { describe, expect, it } from 'vitest';

import { ConsumidorDoCadastro } from './consumidor.js';

import type { ProcessarImportacaoDeProcessos } from '@pz/cadastro';
import type { EventoDominio } from '@pz/kernel';

describe('importação de processos no worker (HU42)', () => {
  it('repassa o evento ao caso de uso, na transação do consumo', async () => {
    const recebidos: unknown[] = [];
    const processar = {
      executar: (tx: unknown, e: unknown) => {
        recebidos.push([tx, e]);
        return Promise.resolve('concluida');
      },
    } as unknown as ProcessarImportacaoDeProcessos<unknown>;
    const evento = {
      tipo: 'ImportacaoDeProcessosSolicitada',
      tenantId: '0199a000-0000-7000-8000-000000000001',
      payload: { importacaoId: '0199a000-0000-7000-8000-000000000002' },
    } as EventoDominio<string, { importacaoId: string }>;
    await new ConsumidorDoCadastro(processar).importacaoSolicitada('tx', evento);
    expect(recebidos).toEqual([['tx', { tenantId: evento.tenantId, payload: evento.payload }]]);
  });
});
