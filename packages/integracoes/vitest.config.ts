import { criarConfigVitest } from '@pz/config/vitest';

// limitador-redis.ts: coberto pelo teste de integração com Redis real.
export default criarConfigVitest({ foraDaCoberturaUnitaria: ['src/limitador-redis.ts'] });
