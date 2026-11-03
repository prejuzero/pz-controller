import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  dataCivil,
  descreverFiltros,
  linhasDaAgenda,
  linhasDaBuscaDePrazos,
  linhasDaBuscaDePublicacoes,
  linhasDoControleDeCiencia,
} from './relatorio.js';

import type { PrazoDoRelatorio } from './relatorio.js';

// Dados FICTÍCIOS (HU29).
const prazo = (sobre: Partial<PrazoDoRelatorio> = {}): PrazoDoRelatorio => ({
  id: 'p1',
  vencimento: '2026-11-10',
  inicio: '2026-11-03',
  tipoAto: 'Contestação',
  status: 'pendente',
  statusCiencia: 'confirmada',
  fundamento: 'CPC, art. 335',
  vencimentoManual: false,
  jurisdicao: { tribunal: 'TJGO' },
  ...sobre,
});

describe('controle de ciência (HU34)', () => {
  it('por prazo: ciência, confirmação e notificações; sem registro, zeros', () => {
    const { colunas, grupos } = linhasDoControleDeCiencia(
      [prazo(), prazo({ id: 'p2', statusCiencia: 'pendente' }), prazo({ id: 'p3' })],
      new Map([
        [
          'p1',
          {
            confirmadaEm: '03/11/2026, 10:00 (horário de Brasília)',
            canal: 'email',
            enviadas: 2,
            entregues: 2,
            rejeitadas: 0,
          },
        ],
        ['p3', { confirmadaEm: null, canal: 'fax', enviadas: 1, entregues: 0, rejeitadas: 1 }],
      ]),
    );
    expect(colunas.map((c) => c.titulo)).toEqual([
      'Vencimento',
      'Ato',
      'Ciência',
      'Confirmada em',
      'Canal',
      'Notificações (env./entr./rej.)',
    ]);
    expect(grupos[0]?.linhas).toEqual([
      {
        vencimento: '10/11/2026',
        ato: 'Contestação',
        ciencia: 'Confirmada',
        confirmadaEm: '03/11/2026, 10:00 (horário de Brasília)',
        canal: 'Link do e-mail',
        notificacoes: '2 / 2 / 0',
      },
      {
        vencimento: '10/11/2026',
        ato: 'Contestação',
        ciencia: 'Pendente',
        confirmadaEm: '',
        canal: '',
        notificacoes: '0 / 0 / 0',
      },
      {
        vencimento: '10/11/2026',
        ato: 'Contestação',
        ciencia: 'Confirmada',
        confirmadaEm: '',
        canal: 'fax',
        notificacoes: '1 / 0 / 1',
      },
    ]);
  });
});

describe('documento do relatório (HU29)', () => {
  it('busca de prazos: as colunas da tela, na ordem da busca', () => {
    const { colunas, grupos } = linhasDaBuscaDePrazos([
      prazo(),
      prazo({ vencimento: null, status: 'a-confirmar', statusCiencia: 'pendente', jurisdicao: {} }),
      prazo({ vencimentoManual: true, status: 'outro' }),
    ]);
    expect(colunas.map((c) => c.titulo)).toEqual([
      'Vencimento',
      'Ato',
      'Situação',
      'Ciência',
      'Tribunal',
    ]);
    expect(grupos[0]?.linhas).toEqual([
      {
        vencimento: '10/11/2026',
        ato: 'Contestação',
        situacao: 'Pendente',
        ciencia: 'Confirmada',
        tribunal: 'TJGO',
      },
      {
        vencimento: 'Sem data',
        ato: 'Contestação',
        situacao: 'A confirmar',
        ciencia: 'Pendente',
        tribunal: '',
      },
      {
        vencimento: '10/11/2026 (manual)',
        ato: 'Contestação',
        situacao: 'outro',
        ciencia: 'Confirmada',
        tribunal: 'TJGO',
      },
    ]);
  });

  it('agenda: agrupada pelo dia, com a memória resumida do motor', () => {
    const { grupos, rotuloDoGrupo } = linhasDaAgenda([
      prazo(),
      prazo({ tipoAto: 'Réplica', fundamento: null, inicio: null, vencimentoManual: true }),
      prazo({ vencimento: '2026-11-11' }),
    ]);
    expect(rotuloDoGrupo).toBe('Vencimento');
    expect(grupos.map((g) => [g.titulo, g.linhas.length])).toEqual([
      ['10/11/2026', 2],
      ['11/11/2026', 1],
    ]);
    expect(grupos[0]?.linhas.map((l) => l.memoria)).toEqual([
      'Início 03/11/2026 · CPC, art. 335',
      'Definida manualmente',
    ]);
    expect(linhasDaAgenda([prazo({ vencimento: null })]).grupos[0]?.titulo).toBe('Sem data');
  });

  it('busca de publicações: número CNJ formatado e trecho do teor', () => {
    const { grupos } = linhasDaBuscaDePublicacoes([
      {
        dataDisponibilizacao: '2026-11-02',
        numeroCnj: '00000010920308090001',
        siglaTribunal: 'TJGO',
        teor: 'x'.repeat(400),
      },
      { dataDisponibilizacao: '2026-11-02', numeroCnj: '123', siglaTribunal: null, teor: 'curto' },
      { dataDisponibilizacao: '2026-11-02', numeroCnj: null, siglaTribunal: null, teor: '' },
    ]);
    const [l1, l2, l3] = grupos[0]?.linhas ?? [];
    expect(l1?.processo).toBe('0000001-09.2030.8.09.0001');
    expect(l1?.teor).toHaveLength(301);
    expect(l2).toMatchObject({ processo: '123', tribunal: '', teor: 'curto' });
    expect(l3?.processo).toBe('');
  });

  it('descreve o filtro do cabeçalho na ordem do pedido', () => {
    expect(
      descreverFiltros({
        tribunal: 'TJGO',
        periodo: { de: '2026-11-01', ate: '2026-11-30', campoData: 'vencimento' },
        statusPrazo: ['pendente', 'vencido'],
        vazio: '',
        nada: null,
        cursor: 'x',
        limite: 20,
        desconhecido: 1,
      }),
    ).toEqual([
      ['Tribunal', 'TJGO'],
      ['De', '01/11/2026'],
      ['Até', '30/11/2026'],
      ['Data alvo', 'vencimento'],
      ['Situação', 'pendente, vencido'],
      ['desconhecido', '1'],
    ]);
  });

  it('data civil sem conversão de fuso', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(1900, 0, 1), max: new Date(2999, 11, 31), noInvalidDate: true }),
        (d) => {
          const iso = d.toISOString().slice(0, 10);
          const [a, m, dia] = iso.split('-');
          expect(dataCivil(iso)).toBe(`${dia ?? ''}/${m ?? ''}/${a ?? ''}`);
        },
      ),
    );
    expect(dataCivil(null)).toBe('');
    expect(dataCivil('ontem')).toBe('ontem');
  });
});
