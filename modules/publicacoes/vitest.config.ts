import { criarConfigVitest } from '@pz/config/vitest';

// Repositórios do PostgreSQL: cobertos pelo teste de integração (Testcontainers).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: [
    'infra/publicacoes-postgres.ts',
    'infra/exportacao-postgres.ts',
    'infra/leitura-postgres.ts',
  ],
});
