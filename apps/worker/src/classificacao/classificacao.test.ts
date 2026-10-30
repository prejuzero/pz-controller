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
    await new ConsumidorDaClassificacao(
      falso({ origem: 'regra', situacao: 'ok' }),
      {} as never,
    ).publicacaoNova('tx', evento);
    await new ConsumidorDaClassificacao(falso(undefined), {} as never).publicacaoNova('tx', evento);
    expect(recebidos).toEqual([
      ['tx', { tenantId: evento.tenantId, payload: evento.payload }],
      ['tx', { tenantId: evento.tenantId, payload: evento.payload }],
    ]);
    expect(ClassificarPublicacao).toBeDefined();
  });

  it('PrazoAjustado vai para o registro de candidatos da curadoria (HU22)', async () => {
    const recebidos: unknown[] = [];
    const candidatos = {
      executar: (tx: unknown, e: unknown) => {
        recebidos.push([tx, e]);
        return Promise.resolve('registrado');
      },
    };
    const ajuste = { tipo: 'PrazoAjustado', agregadoId: 'p1', payload: {} } as EventoDominio;
    await new ConsumidorDaClassificacao({} as never, candidatos as never).prazoAjustado(
      'tx',
      ajuste,
    );
    expect(recebidos).toEqual([['tx', ajuste]]);
  });
});
