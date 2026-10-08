import { criarConfigVitest } from '@pz/config/vitest';

// Adaptadores do BullMQ, do Redis e do PostgreSQL: cobertos pelo teste de integração (infra/*.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: [
    'infra/contador-uso-ia-redis.ts',
    'infra/fila-de-mortos-bullmq.ts',
    'infra/painel-redis.ts',
    'infra/uso-ia-postgres.ts',
  ],
});
