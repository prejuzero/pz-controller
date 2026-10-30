import { FixedClock, Instant, LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { Prazo } from './prazo.js';

import type { CalculoDoPrazo, NovoPrazo } from './prazo.js';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: o cálculo chega pronto (do motor); aqui só se testa o ciclo do agregado.
const relogio = new FixedClock(Instant.deIso('2026-11-02T12:00:00.000Z'));
const TENANT = '01a10e00-0000-7000-8000-00000000a001' as Uuid;
const EVENTO = '01a10e00-0000-7000-8000-00000000e001' as Uuid;

const calculo = (vencimento: string | null, memoria: string): CalculoDoPrazo => ({
  situacao: vencimento === null ? 'a-confirmar' : 'calculado',
  dias: 15,
  unidade: 'dias',
  inicio: LocalDate.de(2027, 3, 3),
  vencimento: vencimento === null ? null : LocalDate.de(2027, 3, Number(vencimento)),
  fimDoPrazo: null,
  fusoDoJuizo: 'America/Sao_Paulo',
  fundamento: 'FICTÍCIO',
  versaoMotor: '1.1.0',
  versaoTabela: 1,
  memoria: { b: memoria, a: [1, { y: 2, x: null }] },
});

const novo = (parcial: Partial<NovoPrazo> = {}): NovoPrazo => ({
  processoId: '01a10e00-0000-7000-8000-00000000c001' as Uuid,
  publicacaoConteudoId: null,
  tipoAto: 'ato-ficticio',
  ramo: 'civel',
  calculo: calculo('23', 'um'),
  entrada: { dataDeReferencia: '2027-03-01' },
  origem: 'djen',
  responsavelId: null,
  jurisdicao: { lacunas: [] },
  ...parcial,
});

describe('Prazo (HU16)', () => {
  it('nasce "a confirmar", na versão 1, e emite PrazoSugerido', () => {
    const prazo = Prazo.sugerir(novo(), TENANT, relogio);
    expect(prazo.estado).toMatchObject({
      tenantId: TENANT,
      status: 'a-confirmar',
      statusCiencia: 'pendente',
      vencimentoManual: false,
      versaoOtimista: 1,
    });
    expect(prazo.retirarEventos().map((e) => [e.tipo, e.tenantId, e.payload])).toEqual([
      [
        'PrazoSugerido',
        TENANT,
        {
          prazoId: prazo.id,
          processoId: novo().processoId,
          tipoAto: 'ato-ficticio',
          origem: 'djen',
          situacao: 'calculado',
          vencimento: '2027-03-23',
        },
      ],
    ]);
    const semData = Prazo.sugerir(novo({ calculo: calculo(null, 'x') }), TENANT, relogio);
    expect(semData.retirarEventos()[0]?.payload).toMatchObject({
      situacao: 'a-confirmar',
      vencimento: null,
    });
  });

  it('mesma memória (em qualquer ordem de chaves) não muda nada', () => {
    const prazo = Prazo.sugerir(novo(), TENANT, relogio);
    prazo.retirarEventos();
    const igual: CalculoDoPrazo = {
      ...calculo('23', 'um'),
      memoria: { a: [1, { x: null, y: 2 }], b: 'um' },
    };
    expect(prazo.recalcular(igual, EVENTO, relogio)).toBe('sem-mudanca');
    expect(prazo.estado.versaoOtimista).toBe(1);
    expect(prazo.retirarEventos()).toEqual([]);
  });

  it('memória diferente com o mesmo vencimento: atualiza sem evento e mantém o status', () => {
    const prazo = Prazo.restaurar({
      ...Prazo.sugerir(novo(), TENANT, relogio).estado,
      status: 'pendente',
    });
    expect(prazo.recalcular(calculo('23', 'dois'), EVENTO, relogio)).toBe('memoria');
    expect(prazo.estado).toMatchObject({ status: 'pendente', versaoOtimista: 2 });
    expect(prazo.retirarEventos()).toEqual([]);
  });

  it('vencimento diferente: volta a "a confirmar" e emite PrazoRecalculado', () => {
    const prazo = Prazo.restaurar({
      ...Prazo.sugerir(novo(), TENANT, relogio).estado,
      status: 'pendente',
    });
    expect(prazo.recalcular(calculo('24', 'dois'), EVENTO, relogio)).toBe('vencimento');
    expect(prazo.estado.status).toBe('a-confirmar');
    expect(prazo.retirarEventos()[0]?.payload).toMatchObject({
      vencimentoAnterior: '2027-03-23',
      vencimentoNovo: '2027-03-24',
      statusAnterior: 'pendente',
      eventoCalendarioId: EVENTO,
    });
  });

  it('não recalcula fechado, data manual ou sem entrada gravada', () => {
    const base = Prazo.sugerir(novo(), TENANT, relogio).estado;
    for (const estado of [
      { ...base, status: 'cumprido' as const },
      { ...base, status: 'vencido' as const },
      { ...base, status: 'cancelado' as const },
      { ...base, vencimentoManual: true },
      { ...base, entrada: null },
    ]) {
      const prazo = Prazo.restaurar(estado);
      expect(prazo.recalculavel).toBe(false);
      expect(prazo.recalcular(calculo('24', 'dois'), EVENTO, relogio)).toBe('sem-mudanca');
    }
  });
});
