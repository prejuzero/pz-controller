import { FixedClock, Instant, NumeroCnj } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { Processo } from './processo.js';
import { Documento, mascararDocumento } from './valores.js';

import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: números CNJ com dígito conferido; documentos de exemplo da Receita.
const relogio = new FixedClock(Instant.deIso('2026-10-07T12:00:00Z'));
const tenantId = '0199c0de-0000-7000-8000-000000000001' as Uuid;
const numero = (texto: string) => {
  const lido = NumeroCnj.de(texto);
  if (!lido.ok) throw lido.erro;
  return lido.valor;
};

describe('Processo (HU12)', () => {
  it('deduz o tribunal do número e nasce com cobertura automática', () => {
    const r = Processo.monitorar(
      { tenantId, numero: numero('0000001-68.2026.8.26.0100'), origem: 'manual' },
      relogio,
    );
    if (!r.ok) throw r.erro;
    expect(r.valor.estado).toMatchObject({
      numeroCnj: '00000016820268260100',
      tribunal: 'TJSP',
      ramo: 'estadual',
      sigiloso: false,
      cobertura: 'automatica',
      motivoCobertura: null,
      clienteId: null,
    });
    expect(r.valor.retirarEventos()).toMatchObject([
      { tipo: 'ProcessoMonitorado', payload: { tribunal: 'TJSP', origem: 'manual' } },
    ]);
  });

  it('cobertura parcial ou manual exige motivo; automática limpa o motivo', () => {
    const base = {
      tenantId,
      numero: numero('1234567-03.2025.5.02.0001'),
      origem: 'manual' as const,
    };
    expect(Processo.monitorar({ ...base, cobertura: 'manual' }, relogio).ok).toBe(false);
    const r = Processo.monitorar(
      { ...base, cobertura: 'parcial', motivoCobertura: 'Painel' },
      relogio,
    );
    if (!r.ok) throw r.erro;
    const processo = r.valor;
    processo.retirarEventos();
    expect(processo.alterarCobertura('manual', null).ok).toBe(false);
    expect(processo.alterarCobertura('parcial', 'Outro motivo').ok).toBe(true);
    expect(processo.retirarEventos()).toEqual([]);
    expect(processo.alterarCobertura('automatica', 'ignorado').ok).toBe(true);
    expect(processo.estado.motivoCobertura).toBeNull();
    expect(processo.retirarEventos()).toMatchObject([
      {
        tipo: 'CoberturaAlterada',
        payload: { antes: 'parcial', depois: 'automatica', motivo: null },
      },
    ]);
  });

  it('atualizar ignora campos ausentes e aceita null para limpar', () => {
    const r = Processo.monitorar(
      {
        tenantId,
        numero: numero('0000010-18.2024.4.03.6100'),
        origem: 'captura',
        orgao: '1ª Vara',
      },
      relogio,
    );
    if (!r.ok) throw r.erro;
    r.valor.atualizar({ comarca: 'São Paulo', orgao: undefined, sigiloso: true });
    expect(r.valor.estado).toMatchObject({
      orgao: '1ª Vara',
      comarca: 'São Paulo',
      sigiloso: true,
    });
    r.valor.atualizar({ orgao: null });
    expect(r.valor.estado.orgao).toBeNull();
  });
});

describe('Documento do cliente', () => {
  it('aceita CPF e CNPJ numérico e alfanumérico (IN RFB nº 2.229/2024)', () => {
    expect(Documento.de('111.444.777-35')).toMatchObject({ ok: true, valor: { tipo: 'cpf' } });
    expect(Documento.de('11.222.333/0001-81')).toMatchObject({
      ok: true,
      valor: { valor: '11222333000181', tipo: 'cnpj' },
    });
    expect(Documento.de('12.abc.345/01de-35')).toMatchObject({
      ok: true,
      valor: { valor: '12ABC34501DE35', tipo: 'cnpj' },
    });
  });

  it('recusa dígito errado, repetidos e tamanho errado', () => {
    for (const texto of [
      '111.444.777-36',
      '11.222.333/0001-82',
      '12ABC34501DE36',
      '00000000000000',
      '123',
    ])
      expect(Documento.de(texto).ok).toBe(false);
  });

  it('propriedade: trocar o último dígito do CNPJ sempre invalida', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), (delta) => {
        const errado = `1122233300018${String((1 + delta) % 10)}`;
        expect(Documento.de(errado).ok).toBe(false);
      }),
    );
  });

  it('mascara só o CPF', () => {
    expect(mascararDocumento('11144477735')).toBe('***.444.777-**');
    expect(mascararDocumento('11222333000181')).toBe('11222333000181');
  });
});
