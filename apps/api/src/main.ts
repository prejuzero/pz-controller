import { carregarAmbiente } from '@pz/config/env';
import { criarLogger, registrarErro } from '@pz/observability';

import { esquemaApi } from './ambiente.js';
import { criarApi } from './app.js';
import { encerrarObservabilidade } from './instrumentacao.js';

const logger = criarLogger('api');

async function iniciar(): Promise<void> {
  const ambiente = carregarAmbiente(esquemaApi);
  const api = await criarApi({ ambiente });
  api
    .getHttpAdapter()
    .getInstance()
    .addHook('onClose', async () => {
      logger.info('api encerrada');
      await encerrarObservabilidade();
    });
  await api.listen(ambiente.PORT, '0.0.0.0');
  logger.info({ porta: ambiente.PORT, versao: ambiente.VERSAO }, 'api no ar');
}

iniciar().catch(async (erro: unknown) => {
  registrarErro(logger, erro, 'falha ao iniciar a api', 'api.boot');
  await encerrarObservabilidade();
  process.exitCode = 1;
});
