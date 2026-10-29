import { LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calendarioDeOcorrencias, type Efeito, type OcorrenciaDatada } from './calendario.js';
import {
  AVISO_ALTERNATIVAS,
  AVISO_FERIADO_LOCAL,
  calcularPrazo,
  VERSAO_DO_MOTOR,
} from './regras.js';

import type { EntradaDoCalculo, PrazoDaTabela, ResultadoDoCalculo } from './modelo.js';

// Calendários FICTÍCIOS: testam a ordem e o efeito das regras, não o calendário real. Os casos
// com datas reais e assinados pela curadora entram na suíte do motor (PZ-135).
// Referência: 01/03/2027 é uma segunda-feira.
const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};
const evento =
  (efeito: Efeito, motivo: string) =>
  (iso: string): OcorrenciaDatada => ({
    data: d(iso),
    efeito,
    motivo,
    atoNormativo: `Ato fictício (${motivo})`,
    urlAto: 'https://exemplo.invalid/ato',
  });
const feriado = evento('sem-expediente', 'feriado fictício');
const suspensao = evento('suspensao-de-prazos', 'suspensão fictícia');
const indisponibilidade = evento('indisponibilidade', 'indisponibilidade fictícia');

const prazo = (extra: Partial<PrazoDaTabela> = {}): PrazoDaTabela => ({
  quantidade: 15,
  unidade: 'dias',
  contagem: 'uteis',
  fundamento: 'CPC, art. 335',
  versao: 'tabela-teste-1',
  dobro: 'entes-cpc',
  ...extra,
});
const entrada = (extra: Partial<EntradaDoCalculo> = {}): EntradaDoCalculo => ({
  ramo: 'civel',
  meio: 'djen',
  dataDeReferencia: d('2027-03-01'),
  prazo: prazo(),
  condicoes: {},
  fusoDoJuizo: 'America/Sao_Paulo',
  calendario: calendarioDeOcorrencias([]),
  ...extra,
});
const penal = (extra: Partial<EntradaDoCalculo> = {}) =>
  entrada({
    ramo: 'penal',
    prazo: prazo({ quantidade: 5, contagem: 'corridos', dobro: 'so-defensoria' }),
    ...extra,
  });

type Calculado = Extract<ResultadoDoCalculo, { situacao: 'calculado' }>;
const calculado = (e: EntradaDoCalculo): Calculado => {
  const r = calcularPrazo(e);
  if (r.situacao !== 'calculado') throw new Error(`esperava calculado: ${r.detalhe}`);
  return r;
};
const iso = (data: LocalDate | undefined) => data?.paraIso();
const resumo = (e: EntradaDoCalculo) => {
  const r = calculado(e);
  return {
    publicacao: iso(r.publicacao),
    ciencia: iso(r.ciencia),
    inicio: iso(r.inicio),
    vencimento: iso(r.vencimento),
  };
};
const desconsiderados = (r: Calculado) =>
  r.diasDesconsiderados.map((dia) => `${dia.data.paraIso()} ${dia.motivo}`);

describe('casos sem cálculo automático (CLAUDE.md, seção 4.4)', () => {
  it('sem regra legal cadastrada para o ato', () => {
    const { prazo: comPrazo, ...semPrazo } = entrada();
    expect(comPrazo).toBeDefined();
    expect(calcularPrazo(semPrazo)).toEqual({
      situacao: 'a-confirmar',
      motivo: 'sem-regra-legal',
      detalhe: 'sem regra legal cadastrada para este ato',
      fundamentos: [],
    });
  });

  it.each(['horas', 'meses', 'anos'] as const)(
    'prazo em %s fica a confirmar (V2, Q14 e Q15)',
    (u) => {
      const r = calcularPrazo(entrada({ prazo: prazo({ unidade: u }) }));
      expect(r).toMatchObject({ situacao: 'a-confirmar', motivo: 'unidade-sem-regra' });
    },
  );

  it('contagem da tabela diferente da regra do ramo não é calculada', () => {
    const r = calcularPrazo(entrada({ prazo: prazo({ contagem: 'corridos' }) }));
    expect(r).toMatchObject({ situacao: 'a-confirmar', motivo: 'dados-insuficientes' });
  });

  it('prazo iniciado antes da vigência da regra fica a confirmar (CPC, art. 14)', () => {
    const civel = calcularPrazo(entrada({ dataDeReferencia: d('2016-03-14') }));
    expect(civel).toMatchObject({ situacao: 'a-confirmar', motivo: 'sem-regra-legal' });
    // Lei 13.728/2018: o art. 12-A da Lei 9.099/1995 vale a partir de 01/11/2018 (V2, aba 3).
    const juizado = calcularPrazo(
      entrada({
        ramo: 'juizados',
        dataDeReferencia: d('2018-10-26'),
        prazo: prazo({ quantidade: 10 }),
      }),
    );
    expect(juizado).toMatchObject({ situacao: 'a-confirmar', motivo: 'sem-regra-legal' });
    expect(
      calculado(entrada({ ramo: 'juizados', dataDeReferencia: d('2018-11-05') })).fundamentos,
    ).toContain('Lei 9.099/1995, art. 12-A');
  });

  it('calendário que nunca deixa contar vira "a confirmar"', () => {
    const tudoSuspenso = {
      ocorrencias: () => [suspensao('2027-03-01')],
      feriadosLocaisVerificados: true,
    };
    const r = calcularPrazo(entrada({ calendario: tudoSuspenso }));
    expect(r).toMatchObject({ situacao: 'a-confirmar', motivo: 'calendario-esgotado' });
  });

  // Calendário (cadastro errado) que fecha tudo a partir de uma data: cada etapa vira "a confirmar".
  const aPartirDe = (inicio: string, gerar: (iso: string) => OcorrenciaDatada) => ({
    ocorrencias: (data: LocalDate) => (data.ehAntesDe(d(inicio)) ? [] : [gerar(data.paraIso())]),
    feriadosLocaisVerificados: true,
  });
  it.each([
    ['publicação (DJEN)', entrada({ calendario: aPartirDe('2027-03-02', feriado) })],
    [
      'ciência na consulta (portal)',
      entrada({
        meio: 'portal',
        dataDaConsulta: d('2027-03-03'),
        calendario: aPartirDe('2027-03-03', feriado),
      }),
    ],
    [
      'início depois da consulta (portal)',
      entrada({
        meio: 'portal',
        dataDaConsulta: d('2027-03-03'),
        calendario: aPartirDe('2027-03-04', feriado),
      }),
    ],
    [
      'início (manual, cível)',
      entrada({ meio: 'manual', calendario: aPartirDe('2027-03-02', feriado) }),
    ],
    [
      'início (manual, penal)',
      penal({ meio: 'manual', calendario: aPartirDe('2027-03-02', suspensao) }),
    ],
    ['contagem', entrada({ calendario: aPartirDe('2027-03-04', suspensao) })],
    ['prorrogação (cível)', entrada({ calendario: aPartirDe('2027-03-23', indisponibilidade) })],
    ['prorrogação (penal)', penal({ calendario: aPartirDe('2027-03-07', indisponibilidade) })],
    [
      'alternativa com a suspensão penal',
      penal({
        dataDeReferencia: d('2027-12-14'),
        prazo: prazo({ quantidade: 9, contagem: 'corridos', dobro: 'so-defensoria' }),
        calendario: aPartirDe('2028-01-21', suspensao),
      }),
    ],
  ])('%s', (_etapa, e) => {
    expect(calcularPrazo(e)).toMatchObject({
      situacao: 'a-confirmar',
      motivo: 'calendario-esgotado',
    });
  });
});

describe('RN03 · DJEN: publicação e início (Lei 11.419/2006, art. 4º, §§3º e 4º)', () => {
  it('cível, 15 dias úteis, sem feriado', () => {
    const r = calculado(entrada());
    expect(resumo(entrada())).toEqual({
      publicacao: '2027-03-02',
      ciencia: undefined,
      inicio: '2027-03-03',
      vencimento: '2027-03-23',
    });
    expect(r.fundamentos).toEqual([
      'Lei 11.419/2006, art. 4º, §§3º e 4º',
      'CPC, art. 224, §§2º e 3º',
      'CPC, arts. 219 e 224',
      'CPC, art. 335',
    ]);
    expect(r.alternativas).toEqual([]);
    expect(r.versaoDoMotor).toBe(VERSAO_DO_MOTOR);
    expect(r.versaoDaTabela).toBe('tabela-teste-1');
  });

  it('disponibilização na sexta: publicação e início na semana seguinte', () => {
    const e = entrada({ dataDeReferencia: d('2027-03-05') });
    expect(resumo(e)).toMatchObject({ publicacao: '2027-03-08', inicio: '2027-03-09' });
    expect(desconsiderados(calculado(e)).slice(0, 2)).toEqual([
      '2027-03-06 sábado',
      '2027-03-07 domingo',
    ]);
  });

  it('feriado no dia seguinte à disponibilização adia a publicação', () => {
    const e = entrada({ calendario: calendarioDeOcorrencias([feriado('2027-03-02')]) });
    expect(resumo(e)).toMatchObject({ publicacao: '2027-03-03', inicio: '2027-03-04' });
  });

  it('suspensão de prazos não impede a publicação, só o início (V2, CT07)', () => {
    const calendario = calendarioDeOcorrencias(
      ['2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05'].map(suspensao),
    );
    expect(resumo(entrada({ calendario }))).toMatchObject({
      publicacao: '2027-03-02',
      inicio: '2027-03-08',
    });
  });
});

describe('RN01 e RN07 · contagem por ramo', () => {
  it('cível em dias úteis: feriado e suspensão no meio do prazo não contam', () => {
    const calendario = calendarioDeOcorrencias([feriado('2027-03-10'), suspensao('2027-03-11')]);
    const r = calculado(entrada({ calendario }));
    expect(iso(r.vencimento)).toBe('2027-03-25');
    expect(desconsiderados(r)).toContain('2027-03-10 feriado fictício');
    expect(desconsiderados(r)).toContain('2027-03-11 suspensão fictícia');
  });

  it('trabalhista e juizado cível em dias úteis, com o fundamento do ramo', () => {
    const trabalhista = calculado(
      entrada({ ramo: 'trabalhista', prazo: prazo({ quantidade: 8 }) }),
    );
    expect(iso(trabalhista.vencimento)).toBe('2027-03-12');
    expect(trabalhista.fundamentos).toContain('CLT, art. 775');
    const juizado = calculado(entrada({ ramo: 'juizados', prazo: prazo({ quantidade: 10 }) }));
    expect(iso(juizado.vencimento)).toBe('2027-03-16');
    expect(juizado.fundamentos).toContain('Lei 9.099/1995, art. 12-A');
  });

  it('penal em dias corridos: feriado e fim de semana no meio contam (V2, C01)', () => {
    const calendario = calendarioDeOcorrencias([feriado('2027-03-04')]);
    const r = calculado(
      penal({
        calendario,
        prazo: prazo({ quantidade: 3, contagem: 'corridos', dobro: 'so-defensoria' }),
      }),
    );
    expect(
      resumo(
        penal({
          calendario,
          prazo: prazo({ quantidade: 3, contagem: 'corridos', dobro: 'so-defensoria' }),
        }),
      ),
    ).toMatchObject({
      publicacao: '2027-03-02',
      inicio: '2027-03-03',
      vencimento: '2027-03-05',
    });
    expect(r.fundamentos).toContain('CPP, art. 798, caput e §1º');
    expect(r.fundamentos).not.toContain('CPC, art. 224, §§2º e 3º');
  });

  it('juizado criminal segue a contagem penal (V2, Q17)', () => {
    const r = calculado(penal({ ramo: 'juizado-criminal' }));
    expect(iso(r.vencimento)).toBe('2027-03-08');
    expect(r.fundamentos).toContain('CPP, art. 798, caput e §1º, c/c Lei 9.099/1995, art. 92');
  });
});

describe('RN08 · prorrogação de início e vencimento', () => {
  it('indisponibilidade no início adia o início; no meio do prazo não altera (V2, CT10 e CT16)', () => {
    const noInicio = calendarioDeOcorrencias([indisponibilidade('2027-03-03')]);
    expect(resumo(entrada({ calendario: noInicio }))).toMatchObject({
      publicacao: '2027-03-02',
      inicio: '2027-03-04',
      vencimento: '2027-03-24',
    });
    const noMeio = calendarioDeOcorrencias([indisponibilidade('2027-03-10')]);
    expect(resumo(entrada({ calendario: noMeio })).vencimento).toBe('2027-03-23');
  });

  it('indisponibilidade no vencimento prorroga para o próximo dia útil (V2, CT22)', () => {
    const calendario = calendarioDeOcorrencias([indisponibilidade('2027-03-23')]);
    const r = calculado(entrada({ calendario }));
    expect(iso(r.vencimento)).toBe('2027-03-24');
    expect(r.fundamentos).toContain('CPC, art. 224, §1º; Lei 11.419/2006, art. 10, §2º');
  });

  it('penal: vencimento no domingo ou feriado prorroga para o dia útil imediato (CPP, art. 798, §3º)', () => {
    const domingo = calculado(penal());
    expect(iso(domingo.vencimento)).toBe('2027-03-08');
    expect(domingo.fundamentos).toContain('CPP, art. 798, §3º');
    const comFeriado = calendarioDeOcorrencias([feriado('2027-03-08')]);
    expect(resumo(penal({ calendario: comFeriado })).vencimento).toBe('2027-03-09');
  });

  it('penal: vencimento no sábado não prorroga; a prorrogação aparece como alternativa (V2, C01)', () => {
    const r = calculado(
      penal({ prazo: prazo({ quantidade: 4, contagem: 'corridos', dobro: 'so-defensoria' }) }),
    );
    expect(iso(r.vencimento)).toBe('2027-03-06');
    expect(r.alternativas.map((a) => [iso(a.vencimento), a.descricao])).toEqual([
      ['2027-03-08', 'prorrogação do vencimento no sábado para o próximo dia útil'],
    ]);
  });

  it('penal: indisponibilidade no vencimento prorroga (Lei 11.419/2006, art. 10, §2º)', () => {
    const calendario = calendarioDeOcorrencias([indisponibilidade('2027-03-05')]);
    const r = calculado(
      penal({
        calendario,
        prazo: prazo({ quantidade: 3, contagem: 'corridos', dobro: 'so-defensoria' }),
      }),
    );
    expect(iso(r.vencimento)).toBe('2027-03-08');
    expect(r.fundamentos).toContain('Lei 11.419/2006, art. 10, §2º');
  });
});

describe('RN02 · suspensão de 20/12 a 20/01 por ramo', () => {
  it('cível: os dias de 20/12 a 20/01 não contam (CPC, art. 220)', () => {
    const r = calculado(entrada({ dataDeReferencia: d('2027-12-14') }));
    expect(resumo(entrada({ dataDeReferencia: d('2027-12-14') }))).toMatchObject({
      publicacao: '2027-12-15',
      inicio: '2027-12-16',
      vencimento: '2028-02-08',
    });
    const suspensos = r.diasDesconsiderados.filter((dia) => dia.fundamento === 'CPC, art. 220');
    expect(iso(suspensos[0]?.data)).toBe('2027-12-20');
    expect(iso(suspensos.at(-1)?.data)).toBe('2028-01-20');
    expect(r.fundamentos).toContain('CPC, art. 220');
  });

  it('disponibilização durante a suspensão: publica e só começa depois de 20/01 (V2, CT07)', () => {
    expect(resumo(entrada({ dataDeReferencia: d('2028-01-05') }))).toMatchObject({
      publicacao: '2028-01-06',
      inicio: '2028-01-21',
    });
  });

  it('trabalhista e juizado cível citam o próprio fundamento', () => {
    const trabalhista = calculado(
      entrada({ ramo: 'trabalhista', dataDeReferencia: d('2027-12-14') }),
    );
    expect(trabalhista.fundamentos).toContain('CLT, art. 775-A');
    const juizado = calculado(entrada({ ramo: 'juizados', dataDeReferencia: d('2027-12-14') }));
    expect(juizado.fundamentos).toContain('CPC, art. 220');
  });

  it('penal sem a informação das exceções: sugere sem suspensão e mostra a data com suspensão (V2, C03)', () => {
    const e = penal({
      dataDeReferencia: d('2027-12-14'),
      prazo: prazo({ quantidade: 9, contagem: 'corridos', dobro: 'so-defensoria' }),
    });
    const r = calculado(e);
    expect(iso(r.vencimento)).toBe('2027-12-24');
    expect(r.alternativas.map((a) => [iso(a.vencimento), a.descricao])).toEqual([
      [
        '2028-01-25',
        'com a suspensão de 20/12 a 20/01 (processo sem réu preso, Lei Maria da Penha ou medida urgente)',
      ],
    ]);
    expect(r.alternativas[0]?.fundamentos).toEqual(['CPP, art. 798-A']);
  });

  it('penal com exceção informada não suspende; sem exceção, suspende', () => {
    const base = {
      dataDeReferencia: d('2027-12-14'),
      prazo: prazo({ quantidade: 9, contagem: 'corridos', dobro: 'so-defensoria' as const }),
    };
    const comExcecao = calculado(penal({ ...base, condicoes: { excecaoDaSuspensaoPenal: true } }));
    expect(iso(comExcecao.vencimento)).toBe('2027-12-24');
    expect(comExcecao.alternativas).toEqual([]);
    const semExcecao = calculado(penal({ ...base, condicoes: { excecaoDaSuspensaoPenal: false } }));
    expect(iso(semExcecao.vencimento)).toBe('2028-01-25');
    expect(semExcecao.fundamentos).toContain('CPP, art. 798-A');
  });

  it('penal antes da Lei 14.365/2022 (vigência em 03/06/2022) não suspende', () => {
    const r = calculado(
      penal({
        dataDeReferencia: d('2021-12-14'),
        prazo: prazo({ quantidade: 9, contagem: 'corridos', dobro: 'so-defensoria' }),
      }),
    );
    expect(r.alternativas).toEqual([]);
    expect(r.fundamentos).not.toContain('CPP, art. 798-A');
  });
});

describe('RN04 · intimação pelo portal (Lei 11.419/2006, art. 5º; V2, C04)', () => {
  const portal = (extra: Partial<EntradaDoCalculo> = {}) => entrada({ meio: 'portal', ...extra });

  it('consulta antes dos 10 dias: ciência na consulta e início no dia útil seguinte', () => {
    const r = calculado(portal({ dataDaConsulta: d('2027-03-03') }));
    expect(resumo(portal({ dataDaConsulta: d('2027-03-03') }))).toEqual({
      publicacao: undefined,
      ciencia: '2027-03-03',
      inicio: '2027-03-04',
      vencimento: '2027-03-24',
    });
    expect(r.fundamentos.slice(0, 2)).toEqual([
      'Lei 11.419/2006, art. 5º, §§1º a 3º',
      'CPC, art. 231, V',
    ]);
  });

  it('consulta em dia não útil: ciência no primeiro dia útil seguinte (art. 5º, §2º)', () => {
    expect(resumo(portal({ dataDaConsulta: d('2027-03-06') }))).toMatchObject({
      ciencia: '2027-03-08',
      inicio: '2027-03-09',
    });
  });

  it('sem consulta: ciência tácita no 10º dia corrido contado do dia seguinte ao envio', () => {
    expect(resumo(portal())).toMatchObject({ ciencia: '2027-03-11', inicio: '2027-03-12' });
    // consulta depois do 10º dia não altera a ciência tácita
    expect(resumo(portal({ dataDaConsulta: d('2027-03-15') })).ciencia).toBe('2027-03-11');
  });

  it('10º dia em dia não útil fica a confirmar (regra pendente com a curadoria)', () => {
    const r = calcularPrazo(portal({ dataDeReferencia: d('2027-03-03') }));
    expect(r).toMatchObject({ situacao: 'a-confirmar', motivo: 'sem-regra-legal' });
  });

  it('consulta anterior ao envio é dado inválido', () => {
    const r = calcularPrazo(portal({ dataDaConsulta: d('2027-02-26') }));
    expect(r).toMatchObject({ situacao: 'a-confirmar', motivo: 'dados-insuficientes' });
  });

  it('processo penal pelo portal não tem regra cadastrada', () => {
    const r = calcularPrazo(penal({ meio: 'portal' }));
    expect(r).toMatchObject({ situacao: 'a-confirmar', motivo: 'ramo-sem-regra' });
  });
});

describe('ciência informada pelo advogado (meio manual)', () => {
  it('cível: início no primeiro dia útil seguinte à ciência', () => {
    expect(resumo(entrada({ meio: 'manual', dataDeReferencia: d('2027-03-05') }))).toEqual({
      publicacao: undefined,
      ciencia: '2027-03-05',
      inicio: '2027-03-08',
      vencimento: '2027-03-26',
    });
  });

  it('penal: exclui só o dia do começo, em dias corridos (CPP, art. 798, §1º)', () => {
    const e = penal({ meio: 'manual', dataDeReferencia: d('2027-03-05') });
    expect(resumo(e)).toMatchObject({
      ciencia: '2027-03-05',
      inicio: '2027-03-06',
      vencimento: '2027-03-10',
    });
  });
});

describe('RN06 · prazo em dobro conforme a tabela', () => {
  const vencimento = (e: EntradaDoCalculo) => iso(calculado(e).vencimento);
  const simples = '2027-03-23';
  const dobrado = '2027-04-13';

  it.each([
    ['fazenda-publica', 'CPC, art. 183'],
    ['ministerio-publico', 'CPC, art. 180'],
    ['defensoria', 'CPC, art. 186'],
  ] as const)('entes do CPC: %s dobra', (ente, fundamento) => {
    const r = calculado(entrada({ condicoes: { ente } }));
    expect(iso(r.vencimento)).toBe(dobrado);
    expect(r.fundamentos).toContain(fundamento);
  });

  it('litisconsortes com procuradores distintos só dobram em autos físicos (CPC, art. 229, §2º)', () => {
    const litis = { litisconsortesComProcuradoresDistintos: true };
    expect(vencimento(entrada({ condicoes: { ...litis, autosFisicos: true } }))).toBe(dobrado);
    expect(vencimento(entrada({ condicoes: litis }))).toBe(simples);
  });

  it('prazo próprio do ente não dobra', () => {
    const e = entrada({
      prazo: prazo({ dobro: 'nao-dobra' }),
      condicoes: { ente: 'fazenda-publica' },
    });
    expect(vencimento(e)).toBe(simples);
  });

  it('penal: só a Defensoria dobra (LC 80/1994)', () => {
    const dez = prazo({ quantidade: 10, contagem: 'corridos', dobro: 'so-defensoria' });
    expect(vencimento(penal({ prazo: dez, condicoes: { ente: 'ministerio-publico' } }))).toBe(
      '2027-03-12',
    );
    const r = calculado(penal({ prazo: dez, condicoes: { ente: 'defensoria' } }));
    expect(iso(r.vencimento)).toBe('2027-03-22');
    expect(r.fundamentos).toContain('LC 80/1994, arts. 44, I, 89, I, e 128, I');
  });

  it('trabalhista: Fazenda dobra para recorrer; os demais entes não', () => {
    const recurso = prazo({ quantidade: 8, dobro: 'fazenda-para-recorrer' });
    const r = calculado(
      entrada({ ramo: 'trabalhista', prazo: recurso, condicoes: { ente: 'fazenda-publica' } }),
    );
    expect(iso(r.vencimento)).toBe('2027-03-24');
    expect(r.fundamentos).toContain('Decreto-Lei 779/1969, art. 1º, III');
    expect(
      vencimento(
        entrada({ ramo: 'trabalhista', prazo: recurso, condicoes: { ente: 'ministerio-publico' } }),
      ),
    ).toBe('2027-03-12');
  });

  it('"verificar caso a caso": sugere o simples e mostra o dobro como alternativa', () => {
    const verificar = prazo({ quantidade: 8, dobro: 'verificar' });
    const r = calculado(
      entrada({ ramo: 'trabalhista', prazo: verificar, condicoes: { ente: 'fazenda-publica' } }),
    );
    expect(iso(r.vencimento)).toBe('2027-03-12');
    expect(r.alternativas.map((a) => [iso(a.vencimento), a.descricao])).toEqual([
      ['2027-03-24', 'prazo em dobro para o ente (tabela: verificar caso a caso)'],
    ]);
    expect(calculado(entrada({ ramo: 'trabalhista', prazo: verificar })).alternativas).toEqual([]);
  });
});

describe('propriedades', () => {
  const datas = fc.integer({ min: 0, max: 3000 }).map((n) => d('2023-01-02').maisDias(n));

  it('a data sugerida nunca é mais tardia que uma alternativa', () => {
    fc.assert(
      fc.property(datas, fc.integer({ min: 1, max: 30 }), (data, quantidade) => {
        const r = calcularPrazo(
          penal({
            dataDeReferencia: data,
            prazo: prazo({ quantidade, contagem: 'corridos', dobro: 'so-defensoria' }),
          }),
        );
        if (r.situacao !== 'calculado') return;
        for (const alternativa of r.alternativas) {
          expect(alternativa.vencimento.ehAntesDe(r.vencimento)).toBe(false);
        }
      }),
    );
  });

  it('cível: o vencimento cai em dia útil e depois da publicação', () => {
    fc.assert(
      fc.property(datas, fc.integer({ min: 1, max: 30 }), (data, quantidade) => {
        const r = calculado(entrada({ dataDeReferencia: data, prazo: prazo({ quantidade }) }));
        expect([0, 6]).not.toContain(r.vencimento.diaDaSemana());
        expect(r.vencimento.ehDepoisDe(r.publicacao ?? data)).toBe(true);
      }),
    );
  });
});

describe('casos de borda (achados pelo teste de mutação)', () => {
  it('texto do aviso de feriado local é o aprovado pela curadoria (V2, aba 8)', () => {
    expect(AVISO_FERIADO_LOCAL).toBe(
      'Feriado local não verificado — confira o calendário da comarca e a legislação aplicável antes de considerar o prazo definitivo.',
    );
    expect(AVISO_ALTERNATIVAS).toBe(
      'Há outras datas possíveis: confira as alternativas e o fundamento de cada uma antes de confirmar.',
    );
  });

  it('autos físicos sem litisconsortes com procuradores distintos não dobram', () => {
    expect(iso(calculado(entrada({ condicoes: { autosFisicos: true } })).vencimento)).toBe(
      '2027-03-23',
    );
  });

  it('dobro decidido pela tabela não gera alternativa', () => {
    for (const e of [
      entrada({ condicoes: { ente: 'fazenda-publica' } }),
      entrada({ prazo: prazo({ dobro: 'nao-dobra' }), condicoes: { ente: 'fazenda-publica' } }),
      entrada({ condicoes: { litisconsortesComProcuradoresDistintos: true, autosFisicos: true } }),
    ]) {
      expect(calculado(e).alternativas).toEqual([]);
    }
  });

  it('a alternativa do dobro cita o fundamento', () => {
    const r = calculado(
      entrada({
        ramo: 'trabalhista',
        prazo: prazo({ quantidade: 8, dobro: 'verificar' }),
        condicoes: { ente: 'fazenda-publica' },
      }),
    );
    expect(r.alternativas[0]?.fundamentos).toEqual(['CPC, art. 183, c/c CLT, art. 769']);
  });

  it('prorrogação no cível não gera alternativa', () => {
    const calendario = calendarioDeOcorrencias([indisponibilidade('2027-03-23')]);
    expect(calculado(entrada({ calendario })).alternativas).toEqual([]);
  });

  it('penal no DJEN cita a Lei 11.419/2006', () => {
    expect(calculado(penal()).fundamentos[0]).toBe('Lei 11.419/2006, art. 4º, §§3º e 4º');
  });

  it('feriado ou suspensão no dia do início adia o início (cível e penal)', () => {
    const feriadoNoInicio = calendarioDeOcorrencias([feriado('2027-03-03')]);
    expect(resumo(entrada({ calendario: feriadoNoInicio })).inicio).toBe('2027-03-04');
    const suspensaoNoInicio = calendarioDeOcorrencias([suspensao('2027-03-03')]);
    expect(resumo(penal({ calendario: suspensaoNoInicio })).inicio).toBe('2027-03-04');
    expect(resumo(penal({ calendario: feriadoNoInicio })).inicio).toBe('2027-03-04');
  });

  it('ciência manual no cível: indisponibilidade no dia seguinte adia o início', () => {
    const calendario = calendarioDeOcorrencias([indisponibilidade('2027-03-02')]);
    const r = calculado(entrada({ meio: 'manual', calendario }));
    expect(iso(r.inicio)).toBe('2027-03-03');
    expect(r.fundamentos[0]).toBe('CPC, art. 224, caput e §3º');
  });

  it('penal: sábado que também é feriado prorroga sem alternativa (CPP, art. 798, §3º)', () => {
    const calendario = calendarioDeOcorrencias([feriado('2027-03-06')]);
    const r = calculado(
      penal({
        calendario,
        prazo: prazo({ quantidade: 4, contagem: 'corridos', dobro: 'so-defensoria' }),
      }),
    );
    expect(iso(r.vencimento)).toBe('2027-03-08');
    expect(r.alternativas).toEqual([]);
    expect(r.fundamentos).toContain('CPP, art. 798, §3º');
    expect(r.fundamentos).not.toContain('Lei 11.419/2006, art. 10, §2º');
  });

  it('penal: feriado no vencimento cita o CPP, não a Lei 11.419/2006', () => {
    const calendario = calendarioDeOcorrencias([feriado('2027-03-05')]);
    const r = calculado(
      penal({
        calendario,
        prazo: prazo({ quantidade: 3, contagem: 'corridos', dobro: 'so-defensoria' }),
      }),
    );
    expect(iso(r.vencimento)).toBe('2027-03-08');
    expect(r.fundamentos).toContain('CPP, art. 798, §3º');
    expect(r.fundamentos).not.toContain('Lei 11.419/2006, art. 10, §2º');
  });

  it('penal com vencimento exatamente em 20/12 mostra a alternativa com a suspensão', () => {
    const r = calculado(penal({ dataDeReferencia: d('2027-12-14') }));
    expect(iso(r.vencimento)).toBe('2027-12-20');
    expect(r.alternativas.map((a) => iso(a.vencimento))).toEqual(['2028-01-21']);
  });

  it('a suspensão de fim de ano aparece na memória com o motivo', () => {
    const r = calculado(entrada({ dataDeReferencia: d('2027-12-14') }));
    expect(r.diasDesconsiderados.find((dia) => iso(dia.data) === '2027-12-20')?.motivo).toBe(
      'suspensão de prazos de 20/12 a 20/01',
    );
  });

  it('portal: dias até a ciência entram na memória', () => {
    const naConsulta = calculado(entrada({ meio: 'portal', dataDaConsulta: d('2027-03-06') }));
    expect(desconsiderados(naConsulta).slice(0, 2)).toEqual([
      '2027-03-06 sábado',
      '2027-03-07 domingo',
    ]);
    const tacita = calculado(entrada({ meio: 'portal' }));
    expect(desconsiderados(tacita)[0]).toBe('2027-03-13 sábado');
  });

  it('"a confirmar" traz o detalhe e os fundamentos', () => {
    expect(calcularPrazo(penal({ meio: 'portal' }))).toEqual({
      situacao: 'a-confirmar',
      motivo: 'ramo-sem-regra',
      detalhe: 'ciência pelo portal no processo penal sem regra cadastrada',
      fundamentos: ['CPC, art. 335'],
    });
    expect(
      calcularPrazo(entrada({ meio: 'portal', dataDaConsulta: d('2027-02-26') })),
    ).toMatchObject({
      detalhe: 'consulta anterior ao envio da intimação',
    });
    expect(
      calcularPrazo(entrada({ meio: 'portal', dataDeReferencia: d('2027-03-03') })),
    ).toMatchObject({
      detalhe: 'ciência tácita em dia não útil: regra pendente com a curadoria',
    });
    expect(calcularPrazo(entrada({ dataDeReferencia: d('2016-03-14') }))).toMatchObject({
      detalhe: 'regra de contagem vigente em 2016-03-16 não cadastrada',
    });
    expect(calcularPrazo(entrada({ fusoDoJuizo: 'Fuso/Inexistente' }))).toEqual({
      situacao: 'a-confirmar',
      motivo: 'dados-insuficientes',
      detalhe: 'fuso do juízo desconhecido: Fuso/Inexistente',
      fundamentos: ['CPC, art. 213, parágrafo único'],
    });
    expect(calcularPrazo(entrada({ prazo: prazo({ contagem: 'corridos' }) }))).toEqual({
      situacao: 'a-confirmar',
      motivo: 'dados-insuficientes',
      detalhe: 'a tabela conta em dias corridos e a regra do ramo em dias uteis',
      fundamentos: ['CPC, art. 335', 'CPC, arts. 219 e 224'],
    });
    const tudoSuspenso = {
      ocorrencias: () => [suspensao('2027-03-01')],
      feriadosLocaisVerificados: true,
    };
    expect(calcularPrazo(entrada({ calendario: tudoSuspenso }))).toEqual({
      situacao: 'a-confirmar',
      motivo: 'calendario-esgotado',
      detalhe: 'calendário sem dia útil a partir de 2027-03-03',
      fundamentos: ['CPC, art. 335'],
    });
  });
});
