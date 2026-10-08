import { criarConfigVitest } from '@pz/config/vitest';

// Os CLIs só leem argumentos e arquivos e chamam as funções testadas em src/*.test.ts.
export default criarConfigVitest({ foraDaCoberturaUnitaria: ['src/cli/**'] });
