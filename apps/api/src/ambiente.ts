import {
  esquemaArmazenamento,
  esquemaBanco,
  esquemaBase,
  esquemaObservabilidade,
  esquemaRedis,
} from '@pz/config/env';
import { z } from 'zod';

/** Ambiente da api (ADR-010): validado no boot; faltou algo, o processo não sobe. */
export const esquemaApi = esquemaBase
  .extend(esquemaObservabilidade.shape)
  .extend(esquemaBanco.shape)
  .extend(esquemaRedis.shape)
  .extend(esquemaArmazenamento.shape)
  .extend({
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    /** Versão implantada (SHA do commit), gravada na imagem pelo build. */
    VERSAO: z.string().min(1).default('dev'),
  });

export type AmbienteApi = z.output<typeof esquemaApi>;
