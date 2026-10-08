import { criarConfigVitest } from '@pz/config/vitest';

// Os CLIs só leem argumentos e arquivos e chamam as funções testadas em src/*.test.ts; o apoio é só dos testes.
export default criarConfigVitest({ foraDaCoberturaUnitaria: ['src/cli/**', 'src/teste-apoio.ts'] });
