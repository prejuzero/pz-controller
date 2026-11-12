import { TRIBUNAIS } from '@pz/kernel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { jurisdicaoDoProcesso, normalizarMunicipio } from './jurisdicao-do-processo.js';

const deUmaUf = TRIBUNAIS.filter((t) => t.ufs.length === 1);
const deVariasUfs = TRIBUNAIS.filter((t) => t.ufs.length > 1);
const nacionais = TRIBUNAIS.filter((t) => t.ufs.length === 0);

describe('jurisdicaoDoProcesso (HU13)', () => {
  it('tribunal de uma UF: deduz a UF; o município fica como lacuna', () => {
    expect(jurisdicaoDoProcesso({ tribunal: 'TJSP', comarca: 'Comarca Fictícia' })).toEqual({
      jurisdicao: { tribunal: 'TJSP', uf: 'SP', comarca: 'Comarca Fictícia' },
      lacunas: ['municipio'],
    });
  });

  it('tribunal de várias UFs: não escolhe UF e a declara como lacuna', () => {
    const trf = deVariasUfs[0];
    if (trf === undefined) throw new Error('Tabela sem tribunal de várias UFs');
    expect(jurisdicaoDoProcesso({ tribunal: trf.sigla, comarca: null })).toEqual({
      jurisdicao: { tribunal: trf.sigla },
      lacunas: ['uf', 'municipio', 'comarca'],
    });
  });

  it('tribunal nacional: sem UF a deduzir, e isso não é lacuna', () => {
    const superior = nacionais[0];
    if (superior === undefined) throw new Error('Tabela sem tribunal nacional');
    expect(jurisdicaoDoProcesso({ tribunal: superior.sigla, comarca: null }).lacunas).toEqual([
      'municipio',
      'comarca',
    ]);
  });

  it('sem tribunal ou com sigla fora da tabela: só o calendário nacional alcança', () => {
    for (const tribunal of [null, 'TJXX']) {
      expect(jurisdicaoDoProcesso({ tribunal, comarca: 'Alfa' })).toEqual({
        jurisdicao: { comarca: 'Alfa' },
        lacunas: ['tribunal', 'uf', 'municipio'],
      });
    }
  });

  it('propriedade: a UF deduzida é sempre a única UF do tribunal na tabela', () => {
    fc.assert(
      fc.property(fc.constantFrom(...deUmaUf), (tribunal) => {
        const { jurisdicao, lacunas } = jurisdicaoDoProcesso({
          tribunal: tribunal.sigla,
          comarca: null,
        });
        expect(jurisdicao.uf).toBe(tribunal.ufs[0]);
        expect(lacunas).not.toContain('uf');
      }),
    );
  });

  it('município pelo nome da comarca, no cadastro territorial da curadoria', () => {
    // Anápolis (GO), IBGE 5201108; tanto faz o prefixo "Comarca de", acento e caixa.
    for (const comarca of ['Anápolis', 'Comarca de ANAPOLIS', '  anápolis ']) {
      expect(jurisdicaoDoProcesso({ tribunal: 'TJGO', comarca })).toEqual({
        jurisdicao: { tribunal: 'TJGO', uf: 'GO', municipioIbge: '5201108', comarca },
        lacunas: [],
      });
    }
  });

  it('tribunal de várias UFs: o município achado dá também a UF', () => {
    // Colatina (ES), subseção do TRF2 (RJ e ES), IBGE 3201506.
    expect(
      jurisdicaoDoProcesso({ tribunal: 'TRF2', comarca: 'Subseção Judiciária de Colatina' }),
    ).toEqual({
      jurisdicao: {
        tribunal: 'TRF2',
        uf: 'ES',
        municipioIbge: '3201506',
        comarca: 'Subseção Judiciária de Colatina',
      },
      lacunas: [],
    });
  });

  it('comarca fora do cadastro ou de outra UF: o município fica como lacuna', () => {
    expect(jurisdicaoDoProcesso({ tribunal: 'TJGO', comarca: 'Colatina' }).lacunas).toEqual([
      'municipio',
    ]);
  });

  it('normaliza como o gerador da carga', () => {
    expect(normalizarMunicipio('  Vara do Trabalho de São   José ')).toBe('sao jose');
    expect(normalizarMunicipio('Foro de Itaúna')).toBe('itauna');
  });
});
