import { criarConfigVitest } from '@pz/config/vitest';

// Repositórios do PostgreSQL: cobertos pelos testes de integração (infra/*.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: [
    'infra/exportacao-postgres.ts',
    'infra/advogados-postgres.ts',
    'infra/processos-postgres.ts',
  ],
});
