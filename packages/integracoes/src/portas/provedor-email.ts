import { z } from 'zod';

import type { SaudeAdaptador } from '../canonicos.js';
import type { ResultadoEnvio } from './canal-notificacao.js';

export const EmailCanonico = z
  .object({
    idempotencia: z.string().min(1).max(200),
    para: z.array(z.email()).min(1).max(50),
    assunto: z.string().min(1).max(200),
    html: z.string().min(1),
    /** Versão em texto puro: obrigatória (acessibilidade e entregabilidade). */
    texto: z.string().min(1),
    /** Rótulos para métricas do provedor; nunca dados do processo. */
    rotulos: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type EmailCanonico = z.infer<typeof EmailCanonico>;

/** Provedor de e-mail transacional (SES, SMTP). O canal de e-mail é construído sobre ele. */
export interface ProvedorEmail {
  enviar(email: EmailCanonico): Promise<ResultadoEnvio>;
  saude(): Promise<SaudeAdaptador>;
}
