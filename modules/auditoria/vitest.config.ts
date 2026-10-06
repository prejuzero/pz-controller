import { criarConfigVitest } from '@pz/config/vitest';

// trilha-postgres.ts: coberto pelos testes de integração com PostgreSQL real.
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/trilha-postgres.ts'],
});
