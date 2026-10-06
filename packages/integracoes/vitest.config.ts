import { criarConfigVitest } from '@pz/config/vitest';

// limitador-redis.ts: coberto pelo teste de integração com Redis real.
// contrato/: kit de contrato, executado pelos testes de integração de cada adaptador.
export default criarConfigVitest({
  foraDaCoberturaUnitaria: ['src/limitador-redis.ts', 'src/contrato/**'],
});
