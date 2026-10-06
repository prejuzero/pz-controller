import { criarConfigVitest } from '@pz/config/vitest';

// provedor-email-smtp.ts: coberto pelo kit de contrato contra o Mailpit (teste de integração).
export default criarConfigVitest({
  foraDaCoberturaUnitaria: ['src/provedor-email-smtp.ts', 'src/index.ts'],
});
