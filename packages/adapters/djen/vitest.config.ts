import { criarConfigVitest } from '@pz/config/vitest';

// servidor-de-fixtures.ts: apoio de teste, exercitado pelo kit de contrato (teste de integração).
export default criarConfigVitest({
  foraDaCoberturaUnitaria: ['src/index.ts', 'src/servidor-de-fixtures.ts'],
});
