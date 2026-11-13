import { criarConfigVitest } from '@pz/config/vitest';

// Requisição, conversão e erros têm teste unitário (fetch falso, sem rede).
export default criarConfigVitest({ foraDaCoberturaUnitaria: ['src/index.ts'] });
