import { describe, expect, it } from 'vitest';

import { ConsumidorDaCiencia } from './consumidor.js';

import type { RegistrarIndicioDeCiencia } from '@pz/ciencia';
import type { EventoDominio } from '@pz/kernel';
import type { RegistrarCienciaNoPrazo } from '@pz/prazos';

const PRAZO = '01a10e00-0000-7000-8000-0000000e0201';
const evento = (tipo: string, payload: unknown) =>
  ({ id: PRAZO, tipo, versao: 1, tenantId: PRAZO, payload }) as unknown as EventoDominio;

describe('consumidor da ciência (HU33)', () => {
  it('confirmação vira espelho no prazo; entrega e cumprimento são indícios', async () => {
    const chamadas: unknown[] = [];
    const consumidor = new ConsumidorDaCiencia(
      {
        executar: (_tx: unknown, id: string) => {
          chamadas.push(['prazo', id]);
          return Promise.resolve('registrada');
        },
      } as unknown as RegistrarCienciaNoPrazo<never>,
      {
        executar: (_tx: unknown, p: { estado: string }) => {
          chamadas.push(['indicio', p.estado]);
          return Promise.resolve(p.estado);
        },
      } as unknown as RegistrarIndicioDeCiencia<never>,
    );
    const tx = {} as never;
    await consumidor.confirmada(tx, evento('CienciaConfirmada', { prazoId: PRAZO }));
    await consumidor.entregue(tx, evento('NotificacaoEntregue', { prazoId: PRAZO }));
    await consumidor.entregue(tx, evento('NotificacaoEntregue', {}));
    await consumidor.cumprido(tx, evento('PrazoCumprido', { prazoId: PRAZO }));
    expect(chamadas).toEqual([
      ['prazo', PRAZO],
      ['indicio', 'entregue'],
      ['indicio', 'cumprido'],
    ]);
  });
});
