import {
  esquemaArmazenamento,
  esquemaBanco,
  esquemaBase,
  esquemaObservabilidade,
  esquemaRedis,
} from '@pz/config/env';
import { z } from 'zod';

/** Ambiente do worker (ADR-010): validado no boot; faltou algo, o processo não sobe. */
export const esquemaWorker = esquemaBase
  .extend(esquemaObservabilidade.shape)
  .extend(esquemaBanco.shape)
  .extend(esquemaRedis.shape)
  .extend(esquemaArmazenamento.shape)
  .extend({
    /** Porta do servidor de saúde (/health/live e /health/ready). */
    PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
    VERSAO: z.string().min(1).default('dev'),
    /**
     * Filas que esta instância processa, separadas por vírgula (vazio = todas). Permite rodar
     * grupos de filas em serviços próprios e escalar cada um (HU10 liga às filas BullMQ).
     */
    WORKER_QUEUES: z
      .string()
      .optional()
      .transform((valor) =>
        (valor ?? '')
          .split(',')
          .map((fila) => fila.trim())
          .filter((fila) => fila.length > 0),
      )
      .pipe(z.array(z.string().regex(/^[a-z][a-z0-9-]*$/, 'nome de fila inválido'))),
    /** Intervalo do ciclo do relay do outbox. */
    RELAY_INTERVALO_MS: z.coerce.number().int().min(100).default(1_000),
  });

export type AmbienteWorker = z.output<typeof esquemaWorker>;
