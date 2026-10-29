import { readFileSync } from 'node:fs';

import { LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { calendarioDeOcorrencias, EFEITOS, type Efeito } from './calendario.js';
import { serializarResultado } from './memoria.js';
import { calcularPrazo } from './regras.js';

import type { EntradaDoCalculo, PoliticaDeDobro, Ramo, Meio, Ente } from './modelo.js';

// Casos com datas reais assinados pela curadora (V2, aba 6). Fonte da verdade: a planilha em
// docs/curadoria; a fixture é a transcrição versionada. Mudar um caso exige nova assinatura.

interface EntradaDoCaso {
  readonly ramo: Ramo;
  readonly meio: Meio;
  readonly dataDeReferencia: string;
  readonly dataDaConsulta?: string;
  readonly fusoDoJuizo: string;
  readonly prazo: {
    readonly quantidade: number;
    readonly contagem: 'uteis' | 'corridos';
    readonly dobro: PoliticaDeDobro;
    readonly fundamento: string;
  };
  readonly condicoes: {
    readonly ente?: Ente;
    readonly litisconsortesComProcuradoresDistintos?: boolean;
    readonly autosFisicos?: boolean;
  };
}
interface DiaDoCalendario {
  readonly data: string;
  readonly efeito: Efeito;
  readonly motivo: string;
  readonly atoNormativo: string;
}
interface Caso {
  readonly id: string;
  readonly regra: string;
  readonly cenario: string;
  readonly entrada: EntradaDoCaso;
  readonly calendario: readonly DiaDoCalendario[];
  readonly esperado: Readonly<
    Record<'publicacao' | 'ciencia' | 'inicio' | 'vencimento' | 'fimDoPrazo', string>
  >;
  readonly assinatura: string;
}
interface Divergencia {
  readonly id: string;
  readonly entrada: EntradaDoCaso;
  readonly calendario: readonly DiaDoCalendario[];
  readonly esperadoPelaCuradora: Readonly<Record<string, string>>;
  readonly respostaDoMotor: Readonly<Record<string, string>>;
  readonly pendencia: string;
}

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/casos-curadoria-v2.json', import.meta.url), 'utf8'),
) as { readonly casos: readonly Caso[]; readonly divergencias: readonly Divergencia[] };

const d = (iso: string) => {
  const r = LocalDate.analisar(iso);
  if (!r.ok) throw r.erro;
  return r.valor;
};

function entradaDo(caso: {
  entrada: EntradaDoCaso;
  calendario: readonly DiaDoCalendario[];
}): EntradaDoCalculo {
  const { entrada } = caso;
  return {
    ramo: entrada.ramo,
    meio: entrada.meio,
    dataDeReferencia: d(entrada.dataDeReferencia),
    ...(entrada.dataDaConsulta === undefined ? {} : { dataDaConsulta: d(entrada.dataDaConsulta) }),
    prazo: { ...entrada.prazo, unidade: 'dias', versao: 'curadoria-v2' },
    condicoes: entrada.condicoes,
    fusoDoJuizo: entrada.fusoDoJuizo,
    calendario: calendarioDeOcorrencias(
      caso.calendario.map((dia) => ({ ...dia, data: d(dia.data), urlAto: 'docs/curadoria' })),
      { feriadosLocaisVerificados: true },
    ),
  };
}

describe('fixture dos casos da curadoria', () => {
  it('tem os 27 casos da aba 6, todos assinados', () => {
    const ids = [...fixture.casos, ...fixture.divergencias].map((caso) => caso.id).sort();
    expect(ids).toEqual(
      Array.from({ length: 27 }, (_, i) => `CT${String(i + 1).padStart(2, '0')}`),
    );
    for (const caso of fixture.casos)
      expect(caso.assinatura).toMatch(/Monnalyza Sodré de Freitas .* 29\/10\/2026/);
    for (const dia of fixture.casos.flatMap((caso) => caso.calendario))
      expect(EFEITOS).toContain(dia.efeito);
  });
});

describe('casos assinados pela curadora (V2, aba 6)', () => {
  it.each(
    fixture.casos.map((caso) => [`${caso.id} · ${caso.regra} · ${caso.cenario}`, caso] as const),
  )('%s', (_nome, caso) => {
    const r = calcularPrazo(entradaDo(caso));
    if (r.situacao !== 'calculado') throw new Error(`${caso.id}: ${r.detalhe}`);
    const obtido: Record<string, string | undefined> = {
      publicacao: r.publicacao?.paraIso(),
      ciencia: r.ciencia?.paraIso(),
      inicio: r.inicio.paraIso(),
      vencimento: r.vencimento.paraIso(),
      fimDoPrazo: r.fimDoPrazo.paraIso(),
    };
    for (const [campo, esperado] of Object.entries(caso.esperado))
      expect(obtido[campo], campo).toBe(esperado);
    // Em dias úteis, todo dia sem expediente ou suspenso que a curadora listou no período aparece
    // na memória de cálculo; em dias corridos, só a suspensão tira o dia da contagem.
    const naMemoria = new Set(r.diasDesconsiderados.map((dia) => dia.data.paraIso()));
    for (const dia of caso.calendario) {
      const relevante =
        !d(dia.data).ehDepoisDe(r.vencimento) &&
        !d(dia.data).ehAntesDe(r.publicacao ?? r.ciencia ?? r.inicio);
      const desconta =
        dia.efeito === 'suspensao-de-prazos' ||
        (dia.efeito === 'sem-expediente' && caso.entrada.prazo.contagem === 'uteis');
      if (relevante && desconta) expect(naMemoria.has(dia.data), dia.data).toBe(true);
    }
    // Determinismo: recalcular dá os mesmos bytes.
    expect(serializarResultado(calcularPrazo(entradaDo(caso)))).toBe(serializarResultado(r));
  });

  it('CT15: sem o comunicado de suspensão, o vencimento era 17/08/2026 (recálculo)', () => {
    const caso = fixture.casos.find((c) => c.id === 'CT15');
    if (caso === undefined) throw new Error('CT15 ausente');
    const antes = {
      ...caso,
      calendario: caso.calendario.filter((dia) => dia.efeito !== 'suspensao-de-prazos'),
    };
    const r = calcularPrazo(entradaDo(antes));
    expect(r.situacao === 'calculado' && r.vencimento.paraIso()).toBe('2026-08-17');
  });
});

// Casos em que a resposta do motor diverge da planilha por regra ainda não definida (card
// "Pendência · Curadoria V2 da HU14"). O teste fixa a resposta atual: quando a curadora decidir,
// o caso volta para a lista principal com a regra implementada.
describe('divergências com a curadoria (pendentes)', () => {
  it.each(fixture.divergencias.map((caso) => [`${caso.id} · ${caso.pendencia}`, caso] as const))(
    '%s',
    (_nome, caso) => {
      const r = calcularPrazo(entradaDo(caso));
      if (r.situacao === 'calculado') {
        expect({
          ciencia: r.ciencia?.paraIso(),
          inicio: r.inicio.paraIso(),
          vencimento: r.vencimento.paraIso(),
        }).toEqual(caso.respostaDoMotor);
        expect(r.vencimento.paraIso()).not.toBe(caso.esperadoPelaCuradora.vencimento);
      } else {
        expect({ situacao: r.situacao, motivo: r.motivo }).toEqual(caso.respostaDoMotor);
      }
    },
  );
});
