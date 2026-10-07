import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { Validacao } from '../erros.js';

import { calcularDigitoCnj, formatarNumeroCnj, lerNumeroCnj, NumeroCnj } from './numero-cnj.js';
import { TRIBUNAIS, tribunalDoNumero } from './tribunais.js';

// Números FICTÍCIOS; dígitos conferidos fora do código (98 − base·100 mod 97).
const VALIDOS = [
  '0000001-68.2026.8.26.0100',
  '1234567-03.2025.5.02.0001',
  '0000010-18.2024.4.03.6100',
];

const digitos = (n: number) =>
  fc.array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n }).map((d) => d.join(''));
const partesSemDigito = fc.record({
  sequencial: digitos(7),
  ano: digitos(4),
  segmento: fc.integer({ min: 1, max: 9 }).map(String),
  tribunal: digitos(2),
  origem: digitos(4),
});
const numeroValido = partesSemDigito.map((p) => ({ ...p, digito: calcularDigitoCnj(p) }));

describe('NumeroCnj (Resolução CNJ 65/2008)', () => {
  it('aceita com e sem pontuação e decompõe as partes', () => {
    for (const texto of VALIDOS) {
      const partes = lerNumeroCnj(texto);
      expect(partes && formatarNumeroCnj(partes)).toBe(texto);
      expect(lerNumeroCnj(texto.replace(/\D/g, ''))).toEqual(partes);
      expect(lerNumeroCnj(` ${texto.replaceAll('.', ' ')} `)).toEqual(partes);
    }
    expect(lerNumeroCnj('0000001-68.2026.8.26.0100')).toEqual({
      sequencial: '0000001',
      digito: '68',
      ano: '2026',
      segmento: '8',
      tribunal: '26',
      origem: '0100',
    });
  });

  it('recusa dígito verificador errado, tamanho errado, letras e segmento 0', () => {
    expect(lerNumeroCnj('0000001-69.2026.8.26.0100')).toBeUndefined();
    expect(lerNumeroCnj('0000001-68.2026.8.26.010')).toBeUndefined();
    expect(lerNumeroCnj('0000001-68.2026.8.26.01000')).toBeUndefined();
    expect(lerNumeroCnj('000000A-68.2026.8.26.0100')).toBeUndefined();
    expect(lerNumeroCnj('0000001/68.2026.8.26.0100')).toBeUndefined();
    expect(lerNumeroCnj('')).toBeUndefined();
    const zero = {
      sequencial: '0000001',
      ano: '2026',
      segmento: '0',
      tribunal: '00',
      origem: '0000',
    };
    expect(
      lerNumeroCnj(formatarNumeroCnj({ ...zero, digito: calcularDigitoCnj(zero) })),
    ).toBeUndefined();
  });

  it('propriedade: todo número com o dígito calculado é aceito e volta igual', () => {
    fc.assert(
      fc.property(numeroValido, (partes) => {
        expect(lerNumeroCnj(formatarNumeroCnj(partes))).toEqual(partes);
      }),
    );
  });

  it('propriedade: trocar um único dígito sempre invalida o número', () => {
    fc.assert(
      fc.property(
        numeroValido,
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 1, max: 9 }),
        (partes, posicao, soma) => {
          const numero = formatarNumeroCnj(partes).replace(/\D/g, '');
          const trocado = (Number(numero[posicao]) + soma) % 10;
          const alterado = `${numero.slice(0, posicao)}${String(trocado)}${numero.slice(posicao + 1)}`;
          expect(lerNumeroCnj(alterado)).toBeUndefined();
        },
      ),
    );
  });

  it('value object: forma canônica, formatação, igualdade e erro de validação', () => {
    const a = NumeroCnj.de('0000001-68.2026.8.26.0100');
    const b = NumeroCnj.de('00000016820268260100');
    if (!a.ok || !b.ok) throw new Error('deveria ser válido');
    expect(a.valor.valor).toBe('00000016820268260100');
    expect(a.valor.formatado()).toBe('0000001-68.2026.8.26.0100');
    expect(a.valor.igual(b.valor)).toBe(true);

    const r = NumeroCnj.de('123', 'processo.numero');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toBeInstanceOf(Validacao);
    expect(r.erro.problemas).toEqual([
      { campo: 'processo.numero', mensagem: 'Número CNJ inválido.' },
    ]);
  });
});

describe('tabela de tribunais', () => {
  it('deduz o tribunal pelo segmento e código', () => {
    const sigla = (texto: string) => {
      const partes = lerNumeroCnj(texto);
      return partes && tribunalDoNumero(partes)?.sigla;
    };
    expect(sigla('0000001-68.2026.8.26.0100')).toBe('TJSP');
    expect(sigla('1234567-03.2025.5.02.0001')).toBe('TRT2');
    expect(sigla('0000010-18.2024.4.03.6100')).toBe('TRF3');
    expect(tribunalDoNumero({ segmento: '8', tribunal: '07' })?.sigla).toBe('TJDFT');
    expect(tribunalDoNumero({ segmento: '4', tribunal: '06' })).toMatchObject({
      sigla: 'TRF6',
      ufs: ['MG'],
    });
    expect(tribunalDoNumero({ segmento: '6', tribunal: '27' })?.sigla).toBe('TRE-TO');
    expect(tribunalDoNumero({ segmento: '9', tribunal: '21' })?.sigla).toBe('TJMRS');
    expect(tribunalDoNumero({ segmento: '3', tribunal: '00' })?.ramo).toBe('superior');
    // Fora da tabela: o processo segue sem tribunal deduzido.
    expect(tribunalDoNumero({ segmento: '8', tribunal: '28' })).toBeUndefined();
    expect(tribunalDoNumero({ segmento: '9', tribunal: '26' })?.sigla).toBe('TJMSP');
    expect(tribunalDoNumero({ segmento: '9', tribunal: '19' })).toBeUndefined();
  });

  it('carga inicial: siglas e códigos únicos, todas as UFs cobertas nos ramos por UF', () => {
    expect(new Set(TRIBUNAIS.map((t) => t.sigla)).size).toBe(TRIBUNAIS.length);
    expect(new Set(TRIBUNAIS.map((t) => `${t.segmento}.${t.codigoTr}`)).size).toBe(
      TRIBUNAIS.length,
    );
    const contar = (ramo: string) => TRIBUNAIS.filter((t) => t.ramo === ramo).length;
    expect([
      contar('superior'),
      contar('federal'),
      contar('trabalho'),
      contar('eleitoral'),
      contar('estadual'),
      contar('militar-estadual'),
    ]).toEqual([5, 6, 24, 27, 27, 3]);
    const ufsDo = (ramo: string) =>
      new Set(TRIBUNAIS.filter((t) => t.ramo === ramo).flatMap((t) => t.ufs));
    for (const ramo of ['federal', 'trabalho', 'eleitoral', 'estadual']) {
      expect(ufsDo(ramo).size).toBe(27);
    }
  });
});
