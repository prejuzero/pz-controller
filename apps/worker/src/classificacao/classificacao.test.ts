import { ClassificarPublicacao } from '@pz/classificacao';
import { describe, expect, it } from 'vitest';

import { ConsumidorDaClassificacao } from './consumidor.js';

import type { EventoDominio } from '@pz/kernel';

const evento = {
  tipo: 'PublicacaoNova',
  tenantId: '0199a000-0000-7000-8000-000000000001',
  payload: { conteudoId: '0199a000-0000-7000-8000-000000000002' },
} as EventoDominio<string, { conteudoId: string }>;

describe('classificação no worker (HU21)', () => {
  it('o consumidor repassa o evento ao caso de uso, na transação do consumo', async () => {
    const recebidos: unknown[] = [];
    const falso = (resultado: unknown) =>
      ({
        executar: (tx: unknown, e: unknown) => {
          recebidos.push([tx, e]);
          return Promise.resolve(resultado);
        },
      }) as unknown as ClassificarPublicacao<unknown>;
    await new ConsumidorDaClassificacao(falso({ origem: 'regra', situacao: 'ok' })).publicacaoNova(
      'tx',
      evento,
    );
    await new ConsumidorDaClassificacao(falso(undefined)).publicacaoNova('tx', evento);
    expect(recebidos).toEqual([
      ['tx', { tenantId: evento.tenantId, payload: evento.payload }],
      ['tx', { tenantId: evento.tenantId, payload: evento.payload }],
    ]);
    expect(ClassificarPublicacao).toBeDefined();
  });
});
