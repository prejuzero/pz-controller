import { z } from 'zod';

import type { SaudeAdaptador } from '../canonicos.js';
import type { ResultadoEnvio } from './canal-notificacao.js';

/** Anexos somados até 10 MB: abaixo do limite comum dos provedores (SES aceita 40 MB). */
export const LIMITE_DOS_ANEXOS_BYTES = 10 * 1024 * 1024;

export const AnexoDeEmail = z
  .object({
    nome: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[\w.-]+$/, { message: 'nome de arquivo simples' }),
    tipoMime: z.enum([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]),
    conteudo: z.instanceof(Uint8Array),
  })
  .strict();
export type AnexoDeEmail = z.infer<typeof AnexoDeEmail>;

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
    /** Envio manual (HU32): o arquivo que o advogado escolheu encaminhar. */
    anexos: z
      .array(AnexoDeEmail)
      .max(3)
      .refine((a) => a.reduce((t, x) => t + x.conteudo.byteLength, 0) <= LIMITE_DOS_ANEXOS_BYTES, {
        message: 'anexos acima de 10 MB',
      })
      .optional(),
  })
  .strict();
export type EmailCanonico = z.infer<typeof EmailCanonico>;

/** Provedor de e-mail transacional (SES, SMTP). O canal de e-mail é construído sobre ele. */
export interface ProvedorEmail {
  enviar(email: EmailCanonico): Promise<ResultadoEnvio>;
  saude(): Promise<SaudeAdaptador>;
}
