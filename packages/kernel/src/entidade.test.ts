import { describe, expect, it } from 'vitest';

import { FixedClock } from './clock.js';
import { AggregateRoot, Entity } from './entidade.js';
import { Instant } from './instant.js';
import { gerarUuidV7 } from './uuid.js';

import type { EventoDominio } from './entidade.js';
import type { Uuid } from './uuid.js';

type ContaAberta = EventoDominio<'ContaAberta', { titular: string }>;

class Conta extends AggregateRoot<ContaAberta> {
  static abrir(id: Uuid, tenantId: Uuid, titular: string, relogio: FixedClock): Conta {
    const conta = new Conta(id);
    conta.registrarEvento({
      id: gerarUuidV7(relogio),
      tipo: 'ContaAberta',
      versao: 1,
      tenantId,
      agregadoId: id,
      ocorridoEm: relogio.agora(),
      payload: { titular },
    });
    return conta;
  }
}

class Item extends Entity {}

describe('Entity e AggregateRoot', () => {
  const relogio = new FixedClock(Instant.deIso('2026-10-05T12:00:00Z'));

  it('entidades são iguais pelo id e pela classe', () => {
    const id = gerarUuidV7();
    expect(new Item(id).igual(new Item(id))).toBe(true);
    expect(new Item(id).igual(new Item(gerarUuidV7()))).toBe(false);
    expect(new Item(id).igual(new Conta(id))).toBe(false);
  });

  it('o agregado registra eventos e os entrega uma única vez', () => {
    const conta = Conta.abrir(gerarUuidV7(), gerarUuidV7(), 'Escritório Exemplo', relogio);

    expect(conta.eventosPendentes()).toHaveLength(1);
    const eventos = conta.retirarEventos();
    expect(eventos).toEqual([
      expect.objectContaining({
        tipo: 'ContaAberta',
        versao: 1,
        agregadoId: conta.id,
        payload: { titular: 'Escritório Exemplo' },
      }),
    ]);
    expect(Object.isFrozen(eventos[0])).toBe(true);
    expect(conta.retirarEventos()).toEqual([]);
  });
});
