import { criarConfigVitest } from '@pz/config/vitest';

// armazenamento-s3.ts: coberto pelo kit de contrato contra o RustFS (teste de integração).
export default criarConfigVitest({
  foraDaCoberturaUnitaria: ['src/armazenamento-s3.ts', 'src/index.ts'],
});
