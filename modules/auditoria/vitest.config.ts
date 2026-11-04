import { criarConfigVitest } from '@pz/config/vitest';

// Repositórios PostgreSQL: cobertos pelos testes de integração com PostgreSQL real.
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: [
    'infra/trilha-postgres.ts',
    'infra/cadeia-postgres.ts',
    'infra/historico-postgres.ts',
  ],
});
