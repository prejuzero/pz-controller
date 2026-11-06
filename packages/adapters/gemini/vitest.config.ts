import { criarConfigVitest } from '@pz/config/vitest';

// O servidor de fixtures: cobertos pelo kit de
// contrato (teste de integração); requisição, conversão e erros têm teste unitário.
export default criarConfigVitest({
  foraDaCoberturaUnitaria: ['src/servidor-de-fixtures.ts', 'src/index.ts'],
});
