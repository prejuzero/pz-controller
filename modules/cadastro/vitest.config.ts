import { criarConfigVitest } from '@pz/config/vitest';

// Repositório do PostgreSQL: coberto pelo teste de integração (infra/cadastro.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/advogados-postgres.ts'],
});
