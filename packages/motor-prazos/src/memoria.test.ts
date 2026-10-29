import { LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calendarioDeOcorrencias } from './calendario.js';
import { formatarMemoria, serializarResultado } from './memoria.js';
import { AVISO_ALTERNATIVAS, AVISO_FERIADO_LOCAL, calcularPrazo } from './regras.js';

import type { EntradaDoCalculo, PrazoDaTabela } from './modelo.js';

// Calendário FICTÍCIO (01/03/2027 é segunda-feira); datas reais assinadas ficam no PZ-135.
const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};
const contestacao: PrazoDaTabela = {
  quantidade: 15,
  unidade: 'dias',
  contagem: 'uteis',
  fundamento: 'CPC, art. 335',
  versao: 'tabela-teste-1',
  dobro: 'entes-cpc',
};
const entrada = (extra: Partial<EntradaDoCalculo> = {}): EntradaDoCalculo => ({
  ramo: 'civel',
  meio: 'djen',
  dataDeReferencia: d('2027-03-05'),
  prazo: contestacao,
  condicoes: {},
  fusoDoJuizo: 'America/Sao_Paulo',
  calendario: calendarioDeOcorrencias(
    [
      {
        data: d('2027-03-10'),
        efeito: 'sem-expediente',
        motivo: 'feriado fictício',
        atoNormativo: 'Lei fictícia 1/2000, art. 1º',
        urlAto: 'https://exemplo.invalid/lei-1',
      },
    ],
    { feriadosLocaisVerificados: true },
  ),
  ...extra,
});

describe('fim do prazo no fuso do juízo (CPC, art. 213, parágrafo único; ADR-013)', () => {
  it('termina às 24h do vencimento no horário do juízo', () => {
    const r = calcularPrazo(entrada({ fusoDoJuizo: 'America/Manaus' }));
    if (r.situacao !== 'calculado') throw new Error(r.detalhe);
    expect(r.vencimento.paraIso()).toBe('2027-03-30');
    // 24h de 30/03 em Manaus (UTC-4) = 04h UTC de 31/03 = 01h de 31/03 em Brasília.
    expect(r.fimDoPrazo.paraIso()).toBe('2027-03-31T04:00:00.000Z');
    expect(r.fusoDoJuizo).toBe('America/Manaus');
    expect(r.avisos).toEqual([
      'O prazo termina às 24h no horário do juízo (America/Manaus), diferente do horário de Brasília.',
    ]);
  });

  it('fuso desconhecido fica a confirmar', () => {
    expect(calcularPrazo(entrada({ fusoDoJuizo: 'Fuso/Inexistente' }))).toMatchObject({
      situacao: 'a-confirmar',
      motivo: 'dados-insuficientes',
    });
  });
});

describe('avisos ao advogado', () => {
  it('feriados locais não verificados, alternativas e alerta da tabela, nesta ordem', () => {
    const r = calcularPrazo(
      entrada({
        ramo: 'trabalhista',
        prazo: {
          quantidade: 8,
          unidade: 'dias',
          contagem: 'uteis',
          fundamento: 'CLT, art. 900',
          versao: 'tabela-teste-1',
          dobro: 'verificar',
          alerta: 'Conferir se o ente tem prazo próprio.',
        },
        condicoes: { ente: 'fazenda-publica' },
        calendario: calendarioDeOcorrencias([]),
      }),
    );
    if (r.situacao !== 'calculado') throw new Error(r.detalhe);
    expect(r.avisos).toEqual([
      AVISO_FERIADO_LOCAL,
      AVISO_ALTERNATIVAS,
      'Conferir se o ente tem prazo próprio.',
    ]);
  });

  it('sem nada a conferir, não há aviso', () => {
    const r = calcularPrazo(entrada());
    if (r.situacao !== 'calculado') throw new Error(r.detalhe);
    expect(r.avisos).toEqual([]);
  });
});

describe('serialização estável (gravar no prazo e comparar em recálculos)', () => {
  it('mesma entrada, mesma saída byte a byte', () => {
    expect(serializarResultado(calcularPrazo(entrada()))).toBe(
      serializarResultado(calcularPrazo(entrada())),
    );
  });

  it('chaves em ordem alfabética, datas em ISO e sem campos ausentes', () => {
    const json = serializarResultado(calcularPrazo(entrada()));
    const objeto = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(objeto)).toEqual([...Object.keys(objeto)].sort());
    expect(objeto).toMatchObject({
      situacao: 'calculado',
      publicacao: '2027-03-08',
      inicio: '2027-03-09',
      vencimento: '2027-03-30',
      fimDoPrazo: '2027-03-31T03:00:00.000Z',
    });
    expect(objeto).not.toHaveProperty('ciencia');
    expect(objeto.fundamentos).toEqual([
      'Lei 11.419/2006, art. 4º, §§3º e 4º',
      'CPC, art. 224, §§2º e 3º',
      'CPC, arts. 219 e 224',
      'CPC, art. 335',
    ]);
    // compacto: sem indentação nem quebra de linha
    expect(json).toBe(JSON.stringify(objeto));
  });

  it('não depende da ordem em que os campos foram montados', () => {
    const r = calcularPrazo(entrada());
    const invertido = Object.fromEntries(Object.entries(r).reverse()) as typeof r;
    expect(serializarResultado(invertido)).toBe(serializarResultado(r));
  });

  it('propriedade: recalcular nunca muda a serialização', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), fc.integer({ min: 1, max: 60 }), (n, q) => {
        const e = (): EntradaDoCalculo =>
          entrada({
            dataDeReferencia: d('2024-01-01').maisDias(n),
            prazo: {
              quantidade: q,
              unidade: 'dias',
              contagem: 'uteis',
              fundamento: 'CPC, art. 335',
              versao: 'tabela-teste-1',
              dobro: 'entes-cpc',
            },
          });
        expect(serializarResultado(calcularPrazo(e()))).toBe(
          serializarResultado(calcularPrazo(e())),
        );
      }),
    );
  });
});

describe('memória de cálculo em português', () => {
  it('calculado: datas, dias desconsiderados, fundamentos e versões', () => {
    expect(formatarMemoria(calcularPrazo(entrada()))).toEqual([
      'Publicação considerada: 08/03/2027',
      'Início da contagem: 09/03/2027',
      'Vencimento sugerido: 30/03/2027, até as 24h no horário do juízo (America/Sao_Paulo)',
      'Dias desconsiderados:',
      '- 06/03/2027: sábado (CPC, art. 216)',
      '- 07/03/2027: domingo (CPC, art. 216)',
      '- 10/03/2027: feriado fictício (CPC, art. 216; Lei fictícia 1/2000, art. 1º)',
      '- 13/03/2027: sábado (CPC, art. 216)',
      '- 14/03/2027: domingo (CPC, art. 216)',
      '- 20/03/2027: sábado (CPC, art. 216)',
      '- 21/03/2027: domingo (CPC, art. 216)',
      '- 27/03/2027: sábado (CPC, art. 216)',
      '- 28/03/2027: domingo (CPC, art. 216)',
      'Fundamentos: Lei 11.419/2006, art. 4º, §§3º e 4º; CPC, art. 224, §§2º e 3º; CPC, arts. 219 e 224; CPC, art. 335',
      'Motor 1.1.0 · tabela tabela-teste-1',
    ]);
  });

  it('ciência, fuso diferente, alternativas e avisos', () => {
    const r = calcularPrazo(
      entrada({
        ramo: 'penal',
        meio: 'manual',
        dataDeReferencia: d('2027-03-01'),
        fusoDoJuizo: 'America/Manaus',
        prazo: {
          quantidade: 5,
          unidade: 'dias',
          contagem: 'corridos',
          fundamento: 'CPP, art. 593',
          versao: 'tabela-teste-1',
          dobro: 'so-defensoria',
        },
      }),
    );
    expect(formatarMemoria(r)).toEqual([
      'Ciência: 01/03/2027',
      'Início da contagem: 02/03/2027',
      'Vencimento sugerido: 06/03/2027, até as 24h no horário do juízo (America/Manaus); em Brasília, 01h00 de 07/03/2027',
      'Fundamentos: CPP, art. 798, caput e §1º; CPP, art. 593',
      'Outras datas possíveis:',
      '- 08/03/2027: prorrogação do vencimento no sábado para o próximo dia útil (CPP, art. 798, §3º)',
      'Atenção: O prazo termina às 24h no horário do juízo (America/Manaus), diferente do horário de Brasília.',
      `Atenção: ${AVISO_ALTERNATIVAS}`,
      'Motor 1.1.0 · tabela tabela-teste-1',
    ]);
  });

  it('a confirmar: o motivo e os fundamentos, sem data', () => {
    const { prazo: comPrazo, ...semPrazo } = entrada();
    expect(comPrazo).toBeDefined();
    expect(formatarMemoria(calcularPrazo(semPrazo))).toEqual([
      'Prazo a confirmar: sem regra legal cadastrada para este ato',
      'O advogado informa a data, que fica marcada como definida manualmente.',
    ]);
    expect(
      formatarMemoria(calcularPrazo(entrada({ prazo: { ...contestacao, unidade: 'horas' } }))),
    ).toEqual([
      'Prazo a confirmar: prazo em horas sem regra de contagem cadastrada',
      'Fundamentos: CPC, art. 335',
      'O advogado informa a data, que fica marcada como definida manualmente.',
    ]);
  });
});
