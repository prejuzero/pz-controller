import { criarConfigVitest } from '@pz/config/vitest';

// Repositórios do PostgreSQL: cobertos pelo teste de integração (infra/*.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: [
    'infra/exportacao-postgres.ts',
    'infra/notificacoes-postgres.ts',
    'infra/consentimentos-postgres.ts',
  ],
});
