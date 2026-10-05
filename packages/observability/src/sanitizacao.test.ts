import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MARCADOR_REMOVIDO, sanitizar, sanitizarTexto } from './sanitizacao.js';

// Dados fictícios: CPF gerado para teste, sem relação com pessoa real.
const CPF_FORMATADO = '123.456.789-09';
const CPF_SEM_MASCARA = '12345678909';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJh';

describe('sanitizarTexto', () => {
  it('remove CPF com e sem máscara', () => {
    expect(sanitizarTexto(`cliente ${CPF_FORMATADO} cadastrado`)).toBe(
      `cliente ${MARCADOR_REMOVIDO} cadastrado`,
    );
    expect(sanitizarTexto(`cpf=${CPF_SEM_MASCARA}`)).toBe(`cpf=${MARCADOR_REMOVIDO}`);
  });

  it('preserva o número CNJ do processo (20 dígitos)', () => {
    expect(sanitizarTexto('processo 00012345620248260100')).toBe('processo 00012345620248260100');
    expect(sanitizarTexto('processo 0001234-56.2024.8.26.0100')).toBe(
      'processo 0001234-56.2024.8.26.0100',
    );
  });

  it('remove token Bearer e JWT soltos no texto', () => {
    expect(sanitizarTexto('Authorization: Bearer abc.def-123')).toBe(
      `Authorization: Bearer ${MARCADOR_REMOVIDO}`,
    );
    expect(sanitizarTexto(`token ${JWT} expirado`)).toBe(`token ${MARCADOR_REMOVIDO} expirado`);
  });
});

describe('sanitizar', () => {
  it('remove o valor de chaves sensíveis em qualquer profundidade', () => {
    const entrada = {
      usuario: { nome: 'Maria', cpf: CPF_FORMATADO, senha: 'segredo123' },
      headers: { authorization: 'Bearer x', cookie: 'sessao=abc', 'set-cookie': ['a=b'] },
      integracoes: [{ accessToken: 'tok', refresh_token: 'ref', apiKey: 'k', 'x-api-key': 'k2' }],
      segredoDoCofre: 's',
      clientSecret: 's2',
      totp: '123456',
    };

    expect(sanitizar(entrada)).toEqual({
      usuario: { nome: 'Maria', cpf: MARCADOR_REMOVIDO, senha: MARCADOR_REMOVIDO },
      headers: {
        authorization: MARCADOR_REMOVIDO,
        cookie: MARCADOR_REMOVIDO,
        'set-cookie': MARCADOR_REMOVIDO,
      },
      integracoes: [
        {
          accessToken: MARCADOR_REMOVIDO,
          refresh_token: MARCADOR_REMOVIDO,
          apiKey: MARCADOR_REMOVIDO,
          'x-api-key': MARCADOR_REMOVIDO,
        },
      ],
      segredoDoCofre: MARCADOR_REMOVIDO,
      clientSecret: MARCADOR_REMOVIDO,
      totp: MARCADOR_REMOVIDO,
    });
  });

  it('mantém chaves que só se parecem com sensíveis', () => {
    const entrada = { secretaria: '2ª Vara', idempotencyKey: 'chave-1', tokenizado: true };
    expect(sanitizar(entrada)).toEqual(entrada);
  });

  it('remove CPF dentro de textos comuns', () => {
    expect(sanitizar({ msg: `CPF ${CPF_FORMATADO}` })).toEqual({ msg: `CPF ${MARCADOR_REMOVIDO}` });
  });

  it('converte Error em objeto sanitizado, incluindo a causa', () => {
    const erro = new Error(`falha para ${CPF_FORMATADO}`, { cause: new Error(`token ${JWT}`) });
    const resultado = sanitizar(erro) as Record<string, unknown>;

    expect(resultado.type).toBe('Error');
    expect(resultado.message).toBe(`falha para ${MARCADOR_REMOVIDO}`);
    expect(String(resultado.stack)).not.toContain(CPF_FORMATADO);
    expect(resultado.cause).toMatchObject({ message: `token ${MARCADOR_REMOVIDO}` });
  });

  it('trata referências circulares, binários, datas e profundidade excessiva', () => {
    const circular: Record<string, unknown> = { nome: 'a' };
    circular.eu = circular;
    const data = new Date('2026-10-05T12:00:00.000Z');
    let profundo: Record<string, unknown> = { fim: true };
    for (let nivel = 0; nivel < 20; nivel += 1) profundo = { filho: profundo };

    expect(sanitizar(circular)).toEqual({ nome: 'a', eu: '[CIRCULAR]' });
    expect(sanitizar({ arquivo: Buffer.from('x') })).toEqual({ arquivo: '[BINARIO]' });
    expect(sanitizar({ data })).toEqual({ data });
    expect(JSON.stringify(sanitizar(profundo))).toContain('[PROFUNDIDADE MAXIMA]');
  });

  it('preserva valores primitivos e nulos', () => {
    expect(sanitizar(null)).toBeNull();
    expect(sanitizar(undefined)).toBeUndefined();
    expect(sanitizar(42)).toBe(42);
    expect(sanitizar(true)).toBe(true);
    expect(sanitizar(10n)).toBe(10n);
  });

  it('nunca deixa um CPF passar, onde quer que ele esteja (propriedade)', () => {
    const digito = fc.integer({ min: 0, max: 9 }).map(String);
    const cpf = fc
      .array(digito, { minLength: 11, maxLength: 11 })
      .chain((d) =>
        fc.constantFrom(
          d.join(''),
          `${d.slice(0, 3).join('')}.${d.slice(3, 6).join('')}.${d.slice(6, 9).join('')}-${d.slice(9).join('')}`,
        ),
      );
    const textoSemDigito = fc.string().map((texto) => texto.replace(/\d/g, ''));

    fc.assert(
      fc.property(
        cpf,
        textoSemDigito,
        textoSemDigito,
        fc.string(),
        (valor, antes, depois, chave) => {
          const saida = JSON.stringify(
            sanitizar({ [chave]: `${antes}${valor}${depois}`, lista: [valor] }),
          );
          expect(saida).not.toContain(valor);
        },
      ),
    );
  });
});
