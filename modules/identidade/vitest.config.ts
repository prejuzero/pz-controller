import { criarConfigVitest } from '@pz/config/vitest';

// Repositórios do PostgreSQL e do Redis: cobertos pelos testes de integração (infra/*.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/credenciais-postgres.ts', 'infra/sessoes-redis.ts'],
});
