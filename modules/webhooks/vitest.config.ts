import { criarConfigVitest } from '@pz/config/vitest';

// Repositórios do PostgreSQL: cobertos pelo teste de integração (infra/webhooks.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/webhooks-postgres.ts'],
});
