import { criarConfigVitest } from '@pz/config/vitest';

// main.ts e instrumentacao.ts são cobertos pelo teste de boot (src/boot.test.ts), que sobe o processo
// real; src/cli são comandos do piloto, rodados contra o banco real (docs/guias/piloto-local.md).
export default criarConfigVitest({
  foraDaCoberturaUnitaria: ['src/main.ts', 'src/instrumentacao.ts', 'src/cli/**'],
});
