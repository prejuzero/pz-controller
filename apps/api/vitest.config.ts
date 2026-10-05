import { criarConfigVitest } from '@pz/config/vitest';

// main.ts e instrumentacao.ts são cobertos pelo teste de boot (src/boot.test.ts), que sobe o processo real.
export default criarConfigVitest({ pontosDeEntrada: ['src/main.ts', 'src/instrumentacao.ts'] });
