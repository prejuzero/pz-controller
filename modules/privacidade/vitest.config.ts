import { criarConfigVitest } from '@pz/config/vitest';

// exportacoes-postgres.ts: coberto pelo teste de integração (Testcontainers), com RLS.
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/exportacoes-postgres.ts', 'infra/encerramento-postgres.ts'],
});
