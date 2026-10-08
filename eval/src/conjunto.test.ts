import { describe, expect, it } from 'vitest';

import { lerArquivosDoConjunto } from './conjunto.js';
import { verificarConjunto } from './verificar.js';

// Roda no CI sobre os casos versionados: nenhum caso entra sem passar na verificação.
describe('conjunto de avaliação versionado (PZ-160)', () => {
  it('todos os casos passam na verificação automática', () => {
    const arquivos = lerArquivosDoConjunto();
    expect(arquivos.length).toBeGreaterThan(0);
    expect(verificarConjunto(arquivos)).toEqual([]);
  });
});
