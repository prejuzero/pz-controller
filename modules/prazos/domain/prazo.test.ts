import { FixedClock, Instant, LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { Prazo } from './prazo.js';

import type { CalculoDoPrazo, NovoPrazo, StatusDoPrazo } from './prazo.js';
import type { Uuid } from '@pz/kernel';

// Dados FICTÍCIOS: o cálculo chega pronto (do motor); aqui só se testa o ciclo do agregado.
const relogio = new FixedClock(Instant.deIso('2026-11-02T12:00:00.000Z'));
const TENANT = '01a10e00-0000-7000-8000-00000000a001' as Uuid;
const EVENTO = '01a10e00-0000-7000-8000-00000000e001' as Uuid;
const PELO_CALENDARIO = { motivo: 'calendario-alterado', eventoCalendarioId: EVENTO } as const;

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
  parametros: {},
  classificacaoIncerta: false,
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
    expect(prazo.recalcular(igual, PELO_CALENDARIO, relogio)).toBe('sem-mudanca');
    expect(prazo.estado.versaoOtimista).toBe(1);
    expect(prazo.retirarEventos()).toEqual([]);
  });

  it('memória diferente com o mesmo vencimento: atualiza sem evento e mantém o status', () => {
    const prazo = Prazo.restaurar({
      ...Prazo.sugerir(novo(), TENANT, relogio).estado,
      status: 'pendente',
    });
    expect(prazo.recalcular(calculo('23', 'dois'), PELO_CALENDARIO, relogio)).toBe('memoria');
    expect(prazo.estado).toMatchObject({ status: 'pendente', versaoOtimista: 2 });
    expect(prazo.retirarEventos()).toEqual([]);
  });

  it('vencimento diferente: volta a "a confirmar" e emite PrazoRecalculado', () => {
    const prazo = Prazo.restaurar({
      ...Prazo.sugerir(novo(), TENANT, relogio).estado,
      status: 'pendente',
    });
    expect(prazo.recalcular(calculo('24', 'dois'), PELO_CALENDARIO, relogio)).toBe('vencimento');
    expect(prazo.estado.status).toBe('a-confirmar');
    expect(prazo.retirarEventos()[0]?.payload).toMatchObject({
      vencimentoAnterior: '2027-03-23',
      vencimentoNovo: '2027-03-24',
      statusAnterior: 'pendente',
      eventoCalendarioId: EVENTO,
    });
  });

  it('comarca corrigida: grava a jurisdição nova mesmo com a mesma data, sem evento (PZ-332)', () => {
    const prazo = Prazo.sugerir(novo(), TENANT, relogio);
    prazo.retirarEventos();
    const igual = prazo.estado.calculo;
    const jurisdicao = { ...prazo.estado.jurisdicao, comarca: 'Comarca Corrigida' };
    expect(prazo.recalcular(igual, { motivo: 'comarca-alterada', jurisdicao }, relogio)).toBe(
      'memoria',
    );
    expect(prazo.estado.jurisdicao.comarca).toBe('Comarca Corrigida');
    expect(prazo.retirarEventos()).toEqual([]);
    // A mesma comarca de novo: nada muda.
    expect(prazo.recalcular(igual, { motivo: 'comarca-alterada', jurisdicao }, relogio)).toBe(
      'sem-mudanca',
    );
    expect(
      prazo.recalcular(calculo('24', 'dois'), { motivo: 'comarca-alterada', jurisdicao }, relogio),
    ).toBe('vencimento');
    const [evento] = prazo.retirarEventos();
    expect(evento?.payload).toMatchObject({ motivo: 'comarca-alterada' });
    expect(evento?.payload).not.toHaveProperty('eventoCalendarioId');
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
      expect(prazo.recalcular(calculo('24', 'dois'), PELO_CALENDARIO, relogio)).toBe('sem-mudanca');
    }
  });
});

describe('máquina de estados do prazo (HU24)', () => {
  const USUARIO = '01a10e00-0000-7000-8000-00000000d001' as Uuid;
  const com = (status: StatusDoPrazo, parcial: Partial<CalculoDoPrazo> = {}) =>
    Prazo.restaurar({
      ...Prazo.sugerir(novo({ calculo: { ...calculo('23', 'um'), ...parcial } }), TENANT, relogio)
        .estado,
      status,
    });
  const tipos = (p: Prazo) => p.retirarEventos().map((e) => e.tipo);

  it('transições válidas: confirmar, cumprir, cancelar e vencer', () => {
    const a = com('a-confirmar');
    expect(a.confirmar(USUARIO, relogio).ok).toBe(true);
    expect(a.estado).toMatchObject({ status: 'pendente', versaoOtimista: 2 });
    expect(a.cumprir(USUARIO, relogio).ok).toBe(true);
    expect(a.estado.status).toBe('cumprido');
    expect(tipos(a)).toEqual(['PrazoConfirmado', 'PrazoCumprido']);

    const c = com('pendente');
    expect(c.cancelar('motivo do cancelamento', USUARIO, relogio).ok).toBe(true);
    expect(c.estado).toMatchObject({ status: 'cancelado', motivoAjuste: 'motivo do cancelamento' });

    for (const status of ['a-confirmar', 'pendente'] as const) {
      const v = com(status);
      expect(v.vencer(LocalDate.de(2027, 3, 23), relogio)).toBe(false);
      expect(v.vencer(LocalDate.de(2027, 3, 24), relogio)).toBe(true);
      expect(v.estado.status).toBe('vencido');
      expect(v.retirarEventos()[0]?.payload).toMatchObject({ statusAnterior: status });
    }
  });

  it('transições inválidas são recusadas sem mudar nada', () => {
    const casos: [StatusDoPrazo, (p: Prazo) => { ok: boolean }][] = [
      ['pendente', (p) => p.confirmar(USUARIO, relogio)],
      ['a-confirmar', (p) => p.cumprir(USUARIO, relogio)],
      ['cumprido', (p) => p.cancelar('motivo qualquer', USUARIO, relogio)],
      ['vencido', (p) => p.cumprir(USUARIO, relogio)],
      ['cancelado', (p) => p.confirmar(USUARIO, relogio)],
    ];
    for (const [status, acao] of casos) {
      const p = com(status);
      expect(acao(p).ok).toBe(false);
      expect(p.estado).toMatchObject({ status, versaoOtimista: 1 });
      expect(p.retirarEventos()).toEqual([]);
    }
    for (const status of ['cumprido', 'cancelado', 'vencido'] as const) {
      expect(com(status).vencer(LocalDate.de(2030, 1, 1), relogio)).toBe(false);
    }
    expect(com('a-confirmar', { vencimento: null }).vencer(LocalDate.de(2030, 1, 1), relogio)).toBe(
      false,
    );
  });

  it('sem vencimento não confirma', () => {
    const r = com('a-confirmar', { vencimento: null }).confirmar(USUARIO, relogio);
    expect(!r.ok && r.erro.codigo).toBe('prazo-sem-vencimento');
  });

  it('ajuste mantém o status, guarda o motivo e emite PrazoAjustado', () => {
    const p = com('pendente');
    const r = p.ajustar(
      {
        calculo: calculo('25', 'manual'),
        tipoAto: 'outro-ato',
        ramo: 'civel',
        vencimentoManual: true,
        entrada: null,
        parametros: {},
      },
      'data informada pelo cartório',
      USUARIO,
      relogio,
    );
    expect(r.ok).toBe(true);
    expect(p.estado).toMatchObject({
      status: 'pendente',
      tipoAto: 'outro-ato',
      vencimentoManual: true,
      motivoAjuste: 'data informada pelo cartório',
      versaoOtimista: 2,
    });
    expect(p.retirarEventos()[0]?.payload).toMatchObject({
      vencimentoAnterior: '2027-03-23',
      vencimentoNovo: '2027-03-25',
      vencimentoManual: true,
    });
    expect(
      com('cumprido').ajustar(
        {
          calculo: calculo('25', 'x'),
          tipoAto: 'a',
          ramo: null,
          vencimentoManual: true,
          entrada: null,
          parametros: {},
        },
        'motivo qualquer',
        USUARIO,
        relogio,
      ).ok,
    ).toBe(false);
  });
});

describe('delegação do prazo (HU41)', () => {
  const ANA = '01a10e00-0000-7000-8000-00000000d001' as Uuid;
  const BIA = '01a10e00-0000-7000-8000-00000000d002' as Uuid;
  const ADMIN = '01a10e00-0000-7000-8000-00000000d003' as Uuid;

  it('troca o responsável, mantém status e datas, sobe a versão e emite PrazoDelegado', () => {
    const prazo = Prazo.sugerir(novo({ responsavelId: ANA }), TENANT, relogio);
    prazo.retirarEventos();
    const antes = prazo.estado;
    expect(prazo.delegar(BIA, ADMIN, relogio).ok).toBe(true);
    expect(prazo.estado).toMatchObject({
      responsavelId: BIA,
      status: 'a-confirmar',
      calculo: antes.calculo,
      versaoOtimista: antes.versaoOtimista + 1,
    });
    expect(prazo.retirarEventos().map((e) => [e.tipo, e.payload])).toEqual([
      [
        'PrazoDelegado',
        {
          prazoId: prazo.id,
          processoId: novo().processoId,
          responsavelAnterior: ANA,
          responsavelNovo: BIA,
          usuarioId: ADMIN,
        },
      ],
    ]);
  });

  it('recusa o mesmo responsável e prazo fechado', () => {
    const prazo = Prazo.sugerir(novo({ responsavelId: ANA }), TENANT, relogio);
    const mesmo = prazo.delegar(ANA, ADMIN, relogio);
    expect(!mesmo.ok && mesmo.erro.codigo).toBe('mesmo-responsavel');
    prazo.cancelar('motivo fictício longo', ADMIN, relogio);
    const fechado = prazo.delegar(BIA, ADMIN, relogio);
    expect(!fechado.ok && fechado.erro.codigo).not.toBe('mesmo-responsavel');
    expect(prazo.estado.responsavelId).toBe(ANA);
  });
});
