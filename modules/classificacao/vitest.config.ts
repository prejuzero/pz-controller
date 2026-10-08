import { criarConfigVitest } from '@pz/config/vitest';

// Repositório do PostgreSQL: coberto pelo teste de integração (infra/*.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/regras-postgres.ts'],
});
