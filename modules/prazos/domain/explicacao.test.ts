import { describe, expect, it } from 'vitest';

import { explicarCalculo } from './explicacao.js';

// Dados FICTÍCIOS: a memória como o motor a grava (JSON, datas ISO). A explicação só lê.
const calculada = {
  situacao: 'calculado',
  publicacao: '2027-03-02',
  inicio: '2027-03-03',
  vencimento: '2027-03-24',
  fimDoPrazo: '2027-03-25T03:00:00.000Z',
  fusoDoJuizo: 'America/Sao_Paulo',
  diasDesconsiderados: [
    { data: '2027-03-06', motivo: 'sábado', fundamento: 'CPC, art. 216' },
    { data: '2027-03-07', motivo: 'domingo', fundamento: 'CPC, art. 216' },
    { data: '2027-03-19', motivo: 'feriado fictício', fundamento: 'Lei fictícia 1' },
  ],
  fundamentos: ['CPC, art. 219', 'CPC, art. 224, §3º'],
  alternativas: [],
  avisos: [],
  versaoDoMotor: '1.1.0',
  versaoDaTabela: '1',
};

describe('explicação do cálculo em linguagem simples (HU62)', () => {
  it('conta a história do cálculo só com o que o motor gravou', () => {
    expect(
      explicarCalculo({ dias: 15, unidade: 'dias', status: 'a-confirmar', memoria: calculada }),
    ).toEqual([
      'O prazo é de 15 dias, contados conforme CPC, art. 219; CPC, art. 224, §3º.',
      'A intimação foi considerada publicada em 02/03/2027, e a contagem começou em 03/03/2027.',
      'Não contaram 3 dias sem expediente: 06/03/2027 (sábado), 07/03/2027 (domingo) e 19/03/2027 (feriado fictício).',
      'O prazo vence em 24/03/2027, até as 24h no horário do juízo (America/Sao_Paulo).',
      'Esta data é uma sugestão: ela só vale depois que você a confirmar.',
    ]);
  });

  it('ciência em vez de publicação, um dia desconsiderado, alternativas e avisos', () => {
    const linhas = explicarCalculo({
      dias: 1,
      unidade: 'dias',
      status: 'pendente',
      memoria: {
        ...calculada,
        publicacao: undefined,
        ciencia: '2027-03-02',
        diasDesconsiderados: [calculada.diasDesconsiderados[0]],
        alternativas: [
          {
            vencimento: '2027-03-26',
            descricao: 'se o ente for público',
            fundamentos: ['CPC, art. 183'],
          },
        ],
        avisos: ['Confira se há litisconsortes.'],
      },
    });
    expect(linhas).toEqual([
      'O prazo é de 1 dia, contado conforme CPC, art. 219; CPC, art. 224, §3º.',
      'A ciência foi em 02/03/2027, e a contagem começou em 03/03/2027.',
      'Não contou 1 dia sem expediente: 06/03/2027 (sábado).',
      'O prazo vence em 24/03/2027, até as 24h no horário do juízo (America/Sao_Paulo).',
      'Há outras leituras possíveis: 26/03/2027 (se o ente for público). O sistema sugere sempre a data mais cedo; a decisão é sua.',
      'Atenção: Confira se há litisconsortes.',
    ]);
  });

  it('sem dias desconsiderados e sem fundamento, sem publicação nem ciência', () => {
    expect(
      explicarCalculo({
        dias: null,
        unidade: null,
        status: 'pendente',
        memoria: {
          ...calculada,
          publicacao: undefined,
          fundamentos: [],
          diasDesconsiderados: [],
        },
      }),
    ).toEqual([
      'A contagem começou em 03/03/2027.',
      'Nenhum dia foi desconsiderado.',
      'O prazo vence em 24/03/2027, até as 24h no horário do juízo (America/Sao_Paulo).',
    ]);
  });

  it('"a confirmar": explica por que não há data e o que fazer', () => {
    expect(
      explicarCalculo({
        dias: null,
        unidade: null,
        status: 'a-confirmar',
        memoria: {
          situacao: 'a-confirmar',
          motivo: 'sem-regra',
          detalhe: 'sem regra legal cadastrada para este ato',
          fundamentos: [],
        },
      }),
    ).toEqual([
      'O sistema não calculou este prazo: sem regra legal cadastrada para este ato.',
      'Informe a data no ajuste; ela fica marcada como definida manualmente.',
    ]);
  });

  it('data definida manualmente: diz que o sistema não calculou e mostra o motivo', () => {
    const manual = (motivo?: string) =>
      explicarCalculo({
        dias: 10,
        unidade: 'dias',
        status: 'pendente',
        memoria: {
          situacao: 'definido-manualmente',
          vencimento: '2027-03-31',
          ...(motivo === undefined ? {} : { motivo }),
        },
      });
    expect(manual('o despacho fixou outra data')).toEqual([
      'A data 31/03/2027 foi definida manualmente pelo advogado, sem cálculo do sistema.',
      'Motivo informado: o despacho fixou outra data',
    ]);
    expect(manual()).toHaveLength(1);
    expect(
      explicarCalculo({
        dias: 10,
        unidade: 'dias',
        status: 'pendente',
        memoria: { situacao: 'definido-manualmente', vencimento: 'x' },
      }),
    ).toEqual([]);
  });

  it('ignora itens malformados das listas; unidade desconhecida não vira texto', () => {
    expect(
      explicarCalculo({
        dias: 2,
        unidade: 'semanas',
        status: 'pendente',
        memoria: {
          ...calculada,
          publicacao: 'nao-e-data',
          fusoDoJuizo: undefined,
          diasDesconsiderados: [null, { data: 'x', motivo: 'm' }, { data: '2027-03-06' }],
          alternativas: [null, { vencimento: 'x', descricao: 'd' }, { vencimento: '2027-03-26' }],
          avisos: [1, 'Aviso fictício.'],
        },
      }),
    ).toEqual([
      'A contagem começou em 03/03/2027.',
      'Nenhum dia foi desconsiderado.',
      'O prazo vence em 24/03/2027, até as 24h no horário do juízo (do juízo).',
      'Atenção: Aviso fictício.',
    ]);
    expect(
      explicarCalculo({
        dias: 1,
        unidade: 'meses',
        status: 'pendente',
        memoria: { ...calculada, fundamentos: 'não é lista' },
      })[0],
    ).toBe('O prazo é de 1 mês.');
    expect(
      explicarCalculo({
        dias: null,
        unidade: null,
        status: 'a-confirmar',
        memoria: { situacao: 'a-confirmar' },
      })[0],
    ).toBe('O sistema não calculou este prazo: faltou um dado.');
  });

  it('memória ausente ou malformada não inventa nada', () => {
    for (const memoria of [null, 'texto', 42, { situacao: 'calculado' }, { situacao: 'outra' }]) {
      expect(explicarCalculo({ dias: 15, unidade: 'dias', status: 'pendente', memoria })).toEqual(
        [],
      );
    }
  });
});
