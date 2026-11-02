import { criarConfigVitest } from '@pz/config/vitest';

export default criarConfigVitest({
  layout: 'modulo',
  // Coberto pelo teste de integração (Postgres real), como nos outros módulos.
  foraDaCoberturaUnitaria: ['infra/ciencia-postgres.ts'],
});
