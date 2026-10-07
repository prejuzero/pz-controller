// Fumaça contra a API real do DJEN (HU17): uma consulta de saúde, que também confere o formato
// da resposta. Não bloqueia o CI; roda semanalmente (.github/workflows/fumaca-djen.yml) ou à mão
// com `pnpm --filter @pz/adapter-djen fumaca`. Não consulta OAB nem processo de ninguém.
import { SystemClock } from '@pz/kernel';

import { FontePublicacoesDjen } from '../src/fonte-djen.js';

const saude = await new FontePublicacoesDjen({ relogio: new SystemClock() }).saude();
process.stdout.write(
  `DJEN: ${saude.estado}${saude.detalhe === undefined ? '' : ` (${saude.detalhe})`}\n`,
);
if (saude.estado !== 'operacional') process.exitCode = 1;
