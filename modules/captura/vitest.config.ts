import { criarConfigVitest } from '@pz/config/vitest';

// captura-postgres.ts: coberto pelo teste de integração (Testcontainers), com RLS e concorrência.
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/captura-postgres.ts'],
});
