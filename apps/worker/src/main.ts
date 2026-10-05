import { carregarAmbiente } from '@pz/config/env';
import { criarLogger, registrarErro } from '@pz/observability';
import { ConsultarSituacao } from '@pz/saude';

import { esquemaWorker } from './ambiente.js';
import { encerrarObservabilidade } from './instrumentacao.js';
import { criarServidorDeSaude } from './saude/servidor.js';
import { criarWorker } from './worker.js';

const logger = criarLogger('worker');

async function iniciar(): Promise<void> {
  const ambiente = carregarAmbiente(esquemaWorker);
  const worker = await criarWorker({ ambiente });
  const saude = criarServidorDeSaude(worker.get(ConsultarSituacao));
  await worker.init();

  const encerrar = async (sinal: NodeJS.Signals) => {
    logger.info({ sinal }, 'encerrando o worker');
    saude.close();
    await worker.close();
    await encerrarObservabilidade();
    logger.info('worker encerrado');
  };
  process.once('SIGTERM', (sinal) => void encerrar(sinal));
  process.once('SIGINT', (sinal) => void encerrar(sinal));

  saude.listen(ambiente.PORT, '0.0.0.0');
  logger.info(
    {
      porta: ambiente.PORT,
      versao: ambiente.VERSAO,
      filas: ambiente.WORKER_QUEUES.length === 0 ? 'todas' : ambiente.WORKER_QUEUES,
    },
    'worker no ar',
  );
}

iniciar().catch(async (erro: unknown) => {
  registrarErro(logger, erro, 'falha ao iniciar o worker', 'worker.boot');
  await encerrarObservabilidade();
  process.exitCode = 1;
});
