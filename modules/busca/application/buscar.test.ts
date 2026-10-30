import { FixedClock, Instant, ok, Validacao, err } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { Buscar } from './buscar.js';

import type { FontesDaBusca } from './buscar.js';
import type { Uuid } from '@pz/kernel';
import type { FiltroDaBuscaDePrazos } from '@pz/prazos';
import type { FiltroDaBuscaDePublicacoes, PublicacaoDoTenant } from '@pz/publicacoes';

// Dados FICTÍCIOS (HU28). Hoje: quinta, 2026-12-31, em São Paulo.
const relogio = new FixedClock(Instant.deIso('2026-12-31T15:00:00.000Z'));
const P1 = '01a10e00-0000-7000-8000-0000000d0001' as Uuid;
const ANA = '01a10e00-0000-7000-8000-0000000d0002' as Uuid;
const BETO = '01a10e00-0000-7000-8000-0000000d0003' as Uuid;
const C1 = '01a10e00-0000-7000-8000-0000000d0004' as Uuid;
const NUMERO = '00000010920308090001';

function fontes(sobrescrever: Partial<FontesDaBusca> = {}) {
  const chamadas: {
    processos: unknown[];
    prazos: FiltroDaBuscaDePrazos[];
    publicacoes: FiltroDaBuscaDePublicacoes[];
    textos: string[];
  } = { processos: [], prazos: [], publicacoes: [], textos: [] };
  const base: FontesDaBusca = {
    processos: (f) => {
      chamadas.processos.push(f);
      return Promise.resolve(ok([P1]));
    },
    oabs: (texto) =>
      Promise.resolve(
        texto === 'GO99'
          ? err(new Validacao([{ campo: 'oab', mensagem: 'x' }]))
          : ok({ oabIds: [C1], usuarioIds: [ANA] }),
      ),
    conteudosComTexto: (texto) => {
      chamadas.textos.push(texto);
      return Promise.resolve(texto === 'comum' ? undefined : [C1]);
    },
    prazos: (f) => {
      chamadas.prazos.push(f);
      return Promise.resolve(
        ok({
          itens: [],
          ultimo: { data: '2027-01-05', id: P1 },
          totalAproximado: 1000,
          totalLimitado: true,
        }),
      );
    },
    publicacoes: (f) => {
      chamadas.publicacoes.push(f);
      return Promise.resolve({
        itens: [
          {
            id: C1,
            numeroCnj: NUMERO,
            dataDisponibilizacao: '2026-12-30',
            teor: 'x'.repeat(200),
          } as PublicacaoDoTenant,
        ],
        ultimo: null,
        totalAproximado: 1,
        totalLimitado: false,
      });
    },
    processosPorNumero: (digitos) =>
      Promise.resolve(
        NUMERO.includes(digitos) ? [{ id: P1, numeroCnj: NUMERO, tribunal: 'TJGO' }] : [],
      ),
    ...sobrescrever,
  };
  return { buscar: new Buscar(base, relogio), chamadas };
}

describe('busca avançada de prazos (HU28)', () => {
  it('combina todos os filtros com E e resolve processo, teor e OAB em ids', async () => {
    const { buscar, chamadas } = fontes();
    const r = await buscar.prazos({
      numeroCnj: '0000001-09.2030.8.09.0001',
      tribunal: 'TJGO',
      orgao: 'vara cível',
      comarca: 'Goiânia',
      clienteId: C1,
      palavraChave: 'contestação',
      partes: 'Fulano',
      responsavelId: ANA,
      oab: 'GO12345',
      tiposAto: ['contestacao'],
      statusCiencia: ['pendente'],
      ramo: 'civel',
      origem: ['djen'],
      periodo: { atalho: 'esta-semana', campoData: 'inicio' },
      limite: 5,
    });
    if (!r.ok) throw r.erro;
    expect(chamadas.processos).toEqual([
      {
        numeroCnj: NUMERO,
        clienteId: C1,
        tribunal: 'TJGO',
        orgao: 'vara cível',
        comarca: 'Goiânia',
      },
    ]);
    expect(chamadas.textos).toEqual(['contestação Fulano']);
    const f = chamadas.prazos[0];
    expect(f).toMatchObject({
      processoIds: [P1],
      conteudoIds: [C1],
      responsavelIds: [ANA],
      tiposAto: ['contestacao'],
      statusCiencia: ['pendente'],
      ramo: 'civel',
      origem: ['djen'],
      campoData: 'inicio',
      ordem: 'asc',
      limite: 5,
    });
    expect([f?.de?.paraIso(), f?.ate?.paraIso()]).toEqual(['2026-12-28', '2027-01-03']);
    expect(r.valor).toMatchObject({ totalAproximado: 1000, totalLimitado: true });

    // O cursor devolvido leva à página seguinte.
    const proxima = await buscar.prazos({ cursor: r.valor.proximoCursor });
    expect(proxima.ok).toBe(true);
    expect(chamadas.prazos[1]?.depoisDe).toBe(P1);
  });

  it('"vencidos" é até ontem e só prazos não cumpridos; OAB de outro advogado não acha nada', async () => {
    const { buscar, chamadas } = fontes();
    await buscar.prazos({ periodo: { atalho: 'vencidos' }, responsavelId: BETO, oab: 'GO12345' });
    expect(chamadas.prazos[0]).toMatchObject({
      status: ['a-confirmar', 'pendente', 'vencido'],
      responsavelIds: [],
      campoData: 'vencimento',
    });
    expect(chamadas.prazos[0]?.ate?.paraIso()).toBe('2026-12-30');
    expect(chamadas.processos).toEqual([]);
  });

  it('intervalo personalizado e erros de entrada viram validação', async () => {
    const { buscar, chamadas } = fontes();
    await buscar.prazos({ periodo: { de: '2027-01-01', ate: '2027-01-31' }, ordem: 'desc' });
    expect(chamadas.prazos[0]).toMatchObject({ ordem: 'desc' });
    const casos = [
      { periodo: { de: '2027-02-01', ate: '2027-01-01' } },
      { periodo: { atalho: 'hoje', de: '2027-01-01' } },
      { periodo: { campoData: 'publicacao' } },
      { numeroCnj: '..-' },
      { cursor: 'nao-e-cursor' },
      { palavraChave: 'comum' },
      { oab: 'GO99' },
      { campoInexistente: 1 },
    ];
    for (const corpo of casos) {
      const r = await buscar.prazos(corpo);
      expect(!r.ok && r.erro.codigo, JSON.stringify(corpo)).toBe('validacao');
    }
    const semProcessos = fontes({
      processos: () => Promise.resolve(err(new Validacao([{ campo: 'tribunal', mensagem: 'x' }]))),
    });
    expect((await semProcessos.buscar.prazos({ tribunal: 'TJSP' })).ok).toBe(false);
    const prazosFalham = fontes({
      prazos: () => Promise.resolve(err(new Validacao([{ campo: 'x', mensagem: 'x' }]))),
    });
    expect((await prazosFalham.buscar.prazos({})).ok).toBe(false);
  });
});

describe('busca avançada de publicações (HU28)', () => {
  it('teor, OAB e período de publicação; mais novas primeiro', async () => {
    const { buscar, chamadas } = fontes();
    const r = await buscar.publicacoes({
      palavraChave: 'sentença',
      oab: 'GO12345',
      tribunal: 'TJGO',
      periodo: { atalho: 'este-mes', campoData: 'publicacao' },
    });
    if (!r.ok) throw r.erro;
    expect(chamadas.publicacoes[0]).toEqual({
      processoIds: [P1],
      oabIds: [C1],
      textos: ['sentença'],
      de: '2026-12-01',
      ate: '2026-12-31',
      ordem: 'desc',
      limite: 20,
    });
    expect(r.valor.proximoCursor).toBeNull();
    const cursor = Buffer.from(JSON.stringify({ d: '2026-12-01', id: C1 })).toString('base64url');
    await buscar.publicacoes({ cursor, ordem: 'asc' });
    expect(chamadas.publicacoes[1]).toMatchObject({
      depoisDe: { data: '2026-12-01', id: C1 },
      ordem: 'asc',
    });
  });

  it('recusa filtros que só existem no prazo e a data alvo de prazo', async () => {
    const { buscar } = fontes();
    for (const corpo of [
      { statusPrazo: ['pendente'] },
      { responsavelId: ANA },
      { periodo: { campoData: 'vencimento' } },
      { cursor: Buffer.from(JSON.stringify({ d: null, id: C1 })).toString('base64url') },
      { oab: 'GO99' },
      { limite: 0 },
    ]) {
      const r = await buscar.publicacoes(corpo);
      expect(!r.ok && r.erro.codigo, JSON.stringify(corpo)).toBe('validacao');
    }
    const semProcessos = fontes({
      processos: () => Promise.resolve(err(new Validacao([{ campo: 'tribunal', mensagem: 'x' }]))),
    });
    expect((await semProcessos.buscar.publicacoes({ tribunal: 'TJSP' })).ok).toBe(false);
  });
});

describe('busca rápida (HU28, RF49)', () => {
  it('CNJ completo, com ou sem pontuação, vai direto ao processo', async () => {
    const { buscar } = fontes();
    for (const texto of [NUMERO, '0000001-09.2030.8.09.0001']) {
      const r = await buscar.rapida({ texto });
      expect(r.ok && r.valor.processoExato).toBe(P1);
    }
    const parcial = await buscar.rapida({ texto: '0000001' });
    expect(parcial.ok && parcial.valor).toEqual({
      processoExato: null,
      itens: [{ tipo: 'processo', id: P1, titulo: '0000001-09.2030.8.09.0001', detalhe: 'TJGO' }],
    });
  });

  it('texto busca no teor e devolve no máximo 8 sugestões com trecho', async () => {
    const { buscar, chamadas } = fontes();
    const r = await buscar.rapida({ texto: 'Fulano de Tal' });
    if (!r.ok) throw r.erro;
    expect(chamadas.publicacoes[0]).toEqual({
      textos: ['Fulano de Tal'],
      ordem: 'desc',
      limite: 8,
    });
    expect(r.valor.itens[0]).toMatchObject({
      tipo: 'publicacao',
      titulo: '0000001-09.2030.8.09.0001',
    });
    expect(r.valor.itens[0]?.detalhe).toHaveLength(121);
    expect((await buscar.rapida({ texto: 'x' })).ok).toBe(false);
  });
});
