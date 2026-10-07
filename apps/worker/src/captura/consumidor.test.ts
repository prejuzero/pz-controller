import { describe, expect, it } from 'vitest';

import { ConsumidorDaCaptura } from './consumidor.js';

import type { ManterAssinaturas } from '@pz/captura';
import type { EventoDominio } from '@pz/kernel';

describe('ConsumidorDaCaptura (HU17)', () => {
  it('repassa cada evento do cadastro ao caso de uso, na transação do consumo', async () => {
    const chamadas: string[] = [];
    const registrar = (nome: string) => (tx: unknown, evento: unknown) => {
      chamadas.push(`${nome} ${String(tx)} ${(evento as EventoDominio).tipo}`);
      return Promise.resolve();
    };
    const consumidor = new ConsumidorDaCaptura({
      oabAdicionada: registrar('adicionada'),
      oabRemovida: registrar('removida'),
      processoMonitorado: registrar('processo'),
    } as unknown as ManterAssinaturas<unknown>);
    const evento = (tipo: string) => ({ tipo }) as EventoDominio;
    await consumidor.oabAdicionada('tx', evento('OabAdicionada'));
    await consumidor.oabRemovida('tx', evento('OabRemovida'));
    await consumidor.processoMonitorado('tx', evento('ProcessoMonitorado'));
    expect(chamadas).toEqual([
      'adicionada tx OabAdicionada',
      'removida tx OabRemovida',
      'processo tx ProcessoMonitorado',
    ]);
  });
});
