import { describe, expect, it } from 'vitest';

import { lerCsv } from './csv.js';

describe('lerCsv', () => {
  it('aspas, aspas escapadas, separador dentro de aspas, CRLF, BOM e linhas em branco', () => {
    expect(lerCsv('﻿a;b\r\n"x;y";"di""z"\r\n\r\n;fim')).toEqual([
      ['a', 'b'],
      ['x;y', 'di"z'],
      ['', 'fim'],
    ]);
    expect(lerCsv('a,b\n1,"2\n3"')).toEqual([
      ['a', 'b'],
      ['1', '2\n3'],
    ]);
  });

  it('última linha sem quebra e arquivo vazio', () => {
    expect(lerCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(lerCsv('')).toEqual([]);
  });
});
