import { criarConfigVitest } from '@pz/config/vitest';

// termos-postgres.ts: coberto pelo teste de integração (Testcontainers), com RLS.
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/termos-postgres.ts'],
});
