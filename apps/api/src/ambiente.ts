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
    /** Chave AES-256 (32 bytes em base64) que cifra segredos da aplicação, como o do 2FA. */
    CHAVE_CIFRAGEM: z
      .base64()
      .refine((valor) => Buffer.from(valor, 'base64').length === 32, 'esperado 32 bytes em base64'),
  });

export type AmbienteApi = z.output<typeof esquemaApi>;
