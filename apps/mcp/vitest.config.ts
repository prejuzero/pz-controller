import { criarConfigVitest } from '@pz/config/vitest';

// main.ts e instrumentacao.ts só compõem e escutam a porta; o servidor HTTP é testado em
// src/http.test.ts.
export default criarConfigVitest({
  foraDaCoberturaUnitaria: ['src/main.ts', 'src/instrumentacao.ts'],
});
