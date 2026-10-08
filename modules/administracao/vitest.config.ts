import { criarConfigVitest } from '@pz/config/vitest';

// Adaptadores do BullMQ e do Redis: cobertos pelo teste de integração (infra/*.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/fila-de-mortos-bullmq.ts', 'infra/painel-redis.ts'],
});
