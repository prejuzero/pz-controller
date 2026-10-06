import { LocalDate } from '@pz/kernel';
import { describe, expect, it } from 'vitest';

import { aprovada } from '../teste/ficticios.js';

import {
  CODIGO_MANIFESTACAO_GENERICA,
  FUNDAMENTO_PRAZO_DO_ATO,
  resolverPrazo,
} from './resolucao.js';

const DATA = LocalDate.de(2026, 10, 6);
const doAto = aprovada({ dias: 15, fundamento: 'FICTÍCIO: Lei de Teste, art. 2º' }, 4);
const generica = aprovada({
  tipoAto: CODIGO_MANIFESTACAO_GENERICA,
  dias: 5,
  fundamento: 'FICTÍCIO: genérica',
});

describe('resolverPrazo (HU15)', () => {
  it('prazo do texto prevalece e os dois são devolvidos', () => {
    const r = resolverPrazo({
      dataDoAto: DATA,
      versoesDoAto: [doAto],
      versoesGenericas: [generica],
      prazoNoTexto: { dias: 10, unidade: 'dias' },
    });
    expect(r).toEqual({
      aplicado: { dias: 10, unidade: 'dias', origem: 'texto' },
      texto: { dias: 10, unidade: 'dias' },
      tabela: expect.objectContaining({ dias: 15, versao: 4, tipoAto: 'ato-ficticio' }) as unknown,
      fundamento: FUNDAMENTO_PRAZO_DO_ATO,
      versaoTabela: 4,
      avisos: [],
    });
  });

  it('sem prazo no texto, aplica a tabela vigente com o fundamento dela', () => {
    const r = resolverPrazo({
      dataDoAto: DATA,
      versoesDoAto: [doAto],
      versoesGenericas: [generica],
    });
    expect(r).toMatchObject({
      aplicado: { dias: 15, unidade: 'dias', origem: 'tabela' },
      texto: null,
      fundamento: 'FICTÍCIO: Lei de Teste, art. 2º',
      versaoTabela: 4,
      avisos: [],
    });
  });

  it('ato sem tabela: manifestação genérica aprovada, com aviso', () => {
    const r = resolverPrazo({ dataDoAto: DATA, versoesDoAto: [], versoesGenericas: [generica] });
    expect(r).toMatchObject({
      aplicado: { dias: 5, origem: 'tabela' },
      tabela: { tipoAto: CODIGO_MANIFESTACAO_GENERICA },
      avisos: ['ato-sem-tabela-usando-manifestacao-generica'],
    });
  });

  it('prazo no texto de ato sem tabela: texto aplicado, genérica exibida com aviso', () => {
    const r = resolverPrazo({
      dataDoAto: DATA,
      versoesDoAto: [],
      versoesGenericas: [generica],
      prazoNoTexto: { dias: 2, unidade: 'dias' },
    });
    expect(r).toMatchObject({
      aplicado: { dias: 2, origem: 'texto' },
      tabela: { tipoAto: CODIGO_MANIFESTACAO_GENERICA },
      avisos: ['ato-sem-tabela-usando-manifestacao-generica'],
    });
  });

  it('sem texto, sem tabela e sem genérica aprovada: a confirmar', () => {
    const r = resolverPrazo({ dataDoAto: DATA, versoesDoAto: [], versoesGenericas: [] });
    expect(r).toEqual({
      aplicado: null,
      tabela: null,
      texto: null,
      fundamento: null,
      versaoTabela: null,
      avisos: ['sem-regra-legal-cadastrada'],
    });
  });

  it('tabela fora de vigência na data do ato não é usada', () => {
    const futura = aprovada({ vigenciaInicio: LocalDate.de(2027, 1, 1) });
    const r = resolverPrazo({ dataDoAto: DATA, versoesDoAto: [futura], versoesGenericas: [] });
    expect(r.aplicado).toBeNull();
  });
});
