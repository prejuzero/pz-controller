import { criarConfigVitest } from '@pz/config/vitest';

// relatorios-postgres.ts: coberto pelo teste de integração (Testcontainers), com RLS.
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/relatorios-postgres.ts'],
});
