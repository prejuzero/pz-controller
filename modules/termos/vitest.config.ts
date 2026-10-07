import { criarConfigVitest } from '@pz/config/vitest';

// termos-postgres.ts: coberto pelo teste de integração (Testcontainers), com RLS.
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/exportacao-postgres.ts', 'infra/termos-postgres.ts'],
});
