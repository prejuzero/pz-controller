import { criarConfigVitest } from '@pz/config/vitest';

// Adaptador do BullMQ: coberto pelo teste de integração (infra/*.int.test.ts).
export default criarConfigVitest({
  layout: 'modulo',
  foraDaCoberturaUnitaria: ['infra/fila-de-mortos-bullmq.ts'],
});
