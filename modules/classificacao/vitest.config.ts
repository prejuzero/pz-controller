import { criarConfigVitest } from '@pz/config/vitest';

// Repositórios do PostgreSQL: coberto pelo teste de integração (infra/*.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: [
    'infra/regras-postgres.ts',
    'infra/classificacoes-postgres.ts',
    'infra/taxonomia-postgres.ts',
  ],
});
