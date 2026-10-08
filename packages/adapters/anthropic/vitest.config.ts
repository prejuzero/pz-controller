import { criarConfigVitest } from '@pz/config/vitest';

// provedor-ia-anthropic.ts (chamadas ao SDK) e o servidor de fixtures: cobertos pelo kit de
// contrato (teste de integração); a conversão e a classificação de erros têm teste unitário.
export default criarConfigVitest({
  foraDaCoberturaUnitaria: ['src/servidor-de-fixtures.ts', 'src/index.ts'],
});
