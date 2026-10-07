import { criarConfigVitest } from '@pz/config/vitest';

// provedor-email-ses.ts: coberto pelo kit de contrato contra o Mailpit (teste de integração).
export default criarConfigVitest({
  foraDaCoberturaUnitaria: ['src/provedor-email-ses.ts', 'src/index.ts'],
});
