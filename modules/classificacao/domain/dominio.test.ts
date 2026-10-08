import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { lerNumeral } from './numerais.js';
import { extrairPrazosCitados } from './prazo-citado.js';
import { classificarPorRegras, padraoValido } from './regras.js';
import { normalizar } from './texto.js';

import type { RegraRapida } from './regras.js';

// Teores FICTÍCIOS.
const UNIDADES = ['', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const ESPECIAIS = [
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];
const DEZENAS = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];
const CENTENAS = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos',
];

/** Gerador de referência para a propriedade (só no teste). */
function porExtenso(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [CENTENAS[c] ?? ''];
  if (resto >= 10 && resto < 20) partes.push(ESPECIAIS[resto - 10] ?? '');
  else partes.push(DEZENAS[Math.floor(resto / 10)] ?? '', UNIDADES[resto % 10] ?? '');
  return partes.filter((p) => p !== '').join(' e ');
}

describe('numerais por extenso', () => {
  it('propriedade: lê de volta todo número de 1 a 999 escrito por extenso', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999 }), (n) => lerNumeral(porExtenso(n)) === n),
    );
  });

  it('feminino, catorze e numerais mal formados', () => {
    expect(lerNumeral('duas')).toBe(2);
    expect(lerNumeral('catorze')).toBe(14);
    expect(lerNumeral('cinco e vinte')).toBeUndefined();
    expect(lerNumeral('vinte e zero')).toBeUndefined();
    expect(lerNumeral('mil')).toBeUndefined();
  });
});

describe('texto normalizado', () => {
  it('minúsculo, sem acento e com o mesmo comprimento', () => {
    const teor = 'Manifestação em 5 DIAS ÚTEIS — 🙂 ok';
    expect(normalizar(teor)).toBe('manifestacao em 5 dias uteis — 🙂 ok');
    expect(normalizar(teor)).toHaveLength(teor.length);
  });
});

describe('prazo citado (HU20)', () => {
  const um = (teor: string) => extrairPrazosCitados(teor)[0];

  it.each([
    [
      'Intime-se para, no prazo de 15 (quinze) dias, apresentar contestação.',
      15,
      'dias',
      '15 (quinze) dias',
    ],
    ['manifeste-se em quinze (15) dias', 15, 'dias', 'quinze (15) dias'],
    ['cumpra em cinco dias úteis', 5, 'dias-uteis', 'cinco dias úteis'],
    ['no prazo de 48 horas', 48, 'horas', '48 horas'],
    ['prazo de trinta e cinco dias', 35, 'dias', 'trinta e cinco dias'],
    ['suspenda por 2 (dois) meses', 2, 'meses', '2 (dois) meses'],
    ['no prazo de um ano', 1, 'anos', 'um ano'],
  ] as const)('%s', (teor, quantidade, unidade, trecho) => {
    expect(um(teor)).toMatchObject({
      quantidade,
      unidade,
      unidadeImplicita: false,
      divergente: false,
      evidencia: { trecho },
    });
  });

  it('a evidência aponta para o teor original (com acento)', () => {
    const teor = 'Prazo: CINCO DIAS ÚTEIS para réplica.';
    const p = um(teor);
    expect(p?.evidencia).toEqual({ inicio: 7, fim: 23, trecho: 'CINCO DIAS ÚTEIS' });
    expect(teor.slice(p?.evidencia.inicio, p?.evidencia.fim)).toBe('CINCO DIAS ÚTEIS');
  });

  it('unidade implícita fica marcada (assumido dias, a conferir)', () => {
    expect(um('no prazo de 10 (dez), sob pena de preclusão')).toMatchObject({
      quantidade: 10,
      unidade: 'dias',
      unidadeImplicita: true,
    });
  });

  it('numeral mal formado não vira prazo; prazo sem unidade e sem extenso', () => {
    expect(extrairPrazosCitados('em cinco e vinte dias')).toEqual([]);
    expect(um('no prazo de 10, sob pena de preclusão')).toMatchObject({
      quantidade: 10,
      unidadeImplicita: true,
      divergente: false,
    });
  });

  it('algarismo e extenso divergentes: vale o menor e fica marcado', () => {
    expect(um('no prazo de 10 (quinze) dias')).toMatchObject({ quantidade: 10, divergente: true });
    expect(um('no prazo de vinte (15) dias')).toMatchObject({ quantidade: 15, divergente: true });
  });

  it('vários prazos em ordem de posição; texto sem prazo não inventa', () => {
    expect(
      extrairPrazosCitados('Réplica em 15 dias; após, alegações finais em 5 (cinco) dias.').map(
        (p) => p.quantidade,
      ),
    ).toEqual([15, 5]);
    expect(extrairPrazosCitados('Vistos. Cite-se o réu.')).toEqual([]);
    expect(extrairPrazosCitados('processo 1234567 dias')).toEqual([]);
  });
});

describe('regras rápidas (HU20)', () => {
  const regras: RegraRapida[] = [
    {
      codigo: 'r-citacao',
      versao: 2,
      tipoAto: 'citacao',
      padroes: ['\\bcite-se\\b'],
      confianca: 0.9,
    },
    {
      codigo: 'r-generica',
      versao: 1,
      tipoAto: 'despacho',
      padroes: ['\\bvistos\\b'],
      confianca: 0.6,
    },
    { codigo: 'r-empate', versao: 1, tipoAto: 'outro', padroes: ['\\bcite-se\\b'], confianca: 0.9 },
  ];

  it('vence a de maior confiança; empate pelo menor código; evidências e prazo juntos', () => {
    const r = classificarPorRegras(
      'Vistos. CITE-SE o réu para contestar em 15 (quinze) dias.',
      regras,
    );
    expect(r).toMatchObject({
      situacao: 'classificada',
      tipoAto: 'citacao',
      regra: { codigo: 'r-citacao', versao: 2 },
      confianca: 0.9,
      evidencias: [{ inicio: 8, fim: 15, trecho: 'CITE-SE' }],
      prazoCitado: { quantidade: 15 },
    });
  });

  it('o desempate não depende da ordem do cadastro', () => {
    const invertidas = [...regras].reverse();
    expect(classificarPorRegras('Cite-se.', invertidas)).toMatchObject({ tipoAto: 'citacao' });
  });

  it('sem regra que case: nenhuma, mas com o prazo citado se houver', () => {
    expect(classificarPorRegras('Intime-se em 5 dias.', regras)).toMatchObject({
      situacao: 'nenhuma',
      prazoCitado: { quantidade: 5 },
    });
    expect(classificarPorRegras('Conclusos.', regras)).toEqual({ situacao: 'nenhuma' });
  });

  it('padrão inválido é detectado; padrão que casa vazio não vira evidência', () => {
    expect(padraoValido('(')).toBe(false);
    expect(padraoValido('\\bcite-se\\b')).toBe(true);
    const vazio: RegraRapida = {
      codigo: 'v',
      versao: 1,
      tipoAto: 'x',
      padroes: ['x{0,3}'],
      confianca: 1,
    };
    expect(classificarPorRegras('abc', [vazio])).toEqual({ situacao: 'nenhuma' });
  });
});
