import { criarConfigVitest } from '@pz/config/vitest';

// main.ts e instrumentacao.ts: cobertos pelo teste de boot (src/boot.test.ts).
// filas/runtime.ts e filas/servico.ts: cobertos pelos testes de integração com Redis real.
export default criarConfigVitest({
  foraDaCoberturaUnitaria: [
    'src/main.ts',
    'src/instrumentacao.ts',
    'src/filas/runtime.ts',
    'src/filas/servico.ts',
  ],
});
