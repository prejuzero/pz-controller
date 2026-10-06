import { criarConfigVitest } from '@pz/config/vitest';

// banco.ts, outbox.ts e webhooks.ts falam com o PostgreSQL: cobertos pelos testes de integração
// (src/*.int.test.ts, Testcontainers). O código gerado e o CLI de reversão também ficam fora.
export default criarConfigVitest({
  foraDaCoberturaUnitaria: [
    'src/gerado/**',
    'src/reverter.ts',
    'src/teste/**',
    'src/banco.ts',
    'src/outbox.ts',
    'src/webhooks.ts',
  ],
});
