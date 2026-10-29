import { DiaDaSemana, LocalDate } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calendarioDeOcorrencias, EFEITOS, type OcorrenciaDatada } from './calendario.js';
import { serializarResultado } from './memoria.js';
import { calcularPrazo } from './regras.js';

import type { EntradaDoCalculo, Meio, Ramo } from './modelo.js';

// Propriedades do motor sobre calendários ALEATÓRIOS (PZ-135): valem para qualquer combinação de
// feriados, suspensões e indisponibilidades, não só para os casos assinados.

const base = LocalDate.de(2026, 1, 1);
const ocorrencia = fc
  .record({ deslocamento: fc.integer({ min: 0, max: 500 }), efeito: fc.constantFrom(...EFEITOS) })
  .map(({ deslocamento, efeito }): OcorrenciaDatada => ({
    data: base.maisDias(deslocamento),
    efeito,
    motivo: `${efeito} aleatório`,
    atoNormativo: 'ato fictício',
    urlAto: 'https://exemplo.invalid/ato',
  }));
const ramoEContagem = fc.constantFrom<readonly [Ramo, 'uteis' | 'corridos']>(
  ['civel', 'uteis'],
  ['juizados', 'uteis'],
  ['trabalhista', 'uteis'],
  ['penal', 'corridos'],
  ['juizado-criminal', 'corridos'],
);
const entrada = fc
  .record({
    ramoEContagem,
    meio: fc.constantFrom<Meio>('djen', 'portal', 'manual'),
    deslocamento: fc.integer({ min: 0, max: 400 }),
    consulta: fc.option(fc.integer({ min: 0, max: 12 }), { nil: undefined }),
    quantidade: fc.integer({ min: 1, max: 30 }),
    ocorrencias: fc.array(ocorrencia, { maxLength: 40 }),
    ente: fc.option(
      fc.constantFrom('fazenda-publica', 'ministerio-publico', 'defensoria' as const),
      {
        nil: undefined,
      },
    ),
  })
  .map(
    ({
      ramoEContagem: [ramo, contagem],
      meio,
      deslocamento,
      consulta,
      quantidade,
      ocorrencias,
      ente,
    }) => {
      const dataDeReferencia = base.maisDias(deslocamento);
      const e: EntradaDoCalculo = {
        ramo,
        meio,
        dataDeReferencia,
        ...(consulta === undefined ? {} : { dataDaConsulta: dataDeReferencia.maisDias(consulta) }),
        prazo: {
          quantidade,
          unidade: 'dias',
          contagem,
          fundamento: 'fundamento fictício',
          versao: 'v',
          dobro: contagem === 'uteis' ? 'entes-cpc' : 'so-defensoria',
        },
        condicoes: ente === undefined ? {} : { ente },
        fusoDoJuizo: 'America/Sao_Paulo',
        calendario: calendarioDeOcorrencias(ocorrencias),
      };
      return { e, ocorrencias };
    },
  );

describe('propriedades do motor com calendários aleatórios', () => {
  it('início depois da referência e vencimento não antes do início', () => {
    fc.assert(
      fc.property(entrada, ({ e }) => {
        const r = calcularPrazo(e);
        if (r.situacao !== 'calculado') return;
        expect(r.inicio.ehDepoisDe(e.dataDeReferencia)).toBe(true);
        expect(r.vencimento.ehAntesDe(r.inicio)).toBe(false);
        for (const alternativa of r.alternativas)
          expect(alternativa.vencimento.ehDepoisDe(r.vencimento)).toBe(true);
      }),
    );
  });

  it('em dias úteis, o vencimento é dia útil, com expediente e sem suspensão nem indisponibilidade', () => {
    fc.assert(
      fc.property(entrada, ({ e, ocorrencias }) => {
        const r = calcularPrazo(e);
        if (r.situacao !== 'calculado' || e.prazo?.contagem !== 'uteis') return;
        const semana = r.vencimento.diaDaSemana();
        expect([DiaDaSemana.sabado, DiaDaSemana.domingo]).not.toContain(semana);
        expect(ocorrencias.some((o) => o.data.igual(r.vencimento))).toBe(false);
        const { mes, dia } = r.vencimento;
        expect((mes === 12 && dia >= 20) || (mes === 1 && dia <= 20)).toBe(false);
      }),
    );
  });

  it('em dias corridos, o vencimento sugerido nunca cai em domingo, feriado ou indisponibilidade', () => {
    fc.assert(
      fc.property(entrada, ({ e, ocorrencias }) => {
        const r = calcularPrazo(e);
        if (r.situacao !== 'calculado' || e.prazo?.contagem !== 'corridos') return;
        expect(r.vencimento.diaDaSemana()).not.toBe(DiaDaSemana.domingo);
        expect(ocorrencias.some((o) => o.data.igual(r.vencimento))).toBe(false);
      }),
    );
  });

  it('determinismo: a mesma entrada gera os mesmos bytes', () => {
    fc.assert(
      fc.property(entrada, ({ e }) => {
        expect(serializarResultado(calcularPrazo(e))).toBe(serializarResultado(calcularPrazo(e)));
      }),
    );
  });

  it('o dobro nunca encurta o prazo', () => {
    fc.assert(
      fc.property(entrada, ({ e }) => {
        // O gerador só informa o ente nas condições: sem ele, o prazo é o simples.
        const simples = calcularPrazo({ ...e, condicoes: {} });
        const comEnte = calcularPrazo(e);
        if (simples.situacao !== 'calculado' || comEnte.situacao !== 'calculado') return;
        expect(comEnte.vencimento.ehAntesDe(simples.vencimento)).toBe(false);
      }),
    );
  });
});
