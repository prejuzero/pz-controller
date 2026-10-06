import { criarConfigVitest } from '@pz/config/vitest';

// Fora da cobertura unitária: os hooks React só repassam as consultas de src/api, e os pontos de
// entrada do Next.js só ligam código testado aqui; ficam com o E2E (PZ-167).
export default criarConfigVitest({
  foraDaCoberturaUnitaria: [
    'src/api/hooks.ts',
    'src/instrumentation-client.ts',
    'src/i18n/requisicao.ts',
  ],
});
