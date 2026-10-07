import {
  esquemaArmazenamento,
  esquemaBanco,
  esquemaBase,
  esquemaEmail,
  esquemaObservabilidade,
  esquemaRedis,
  esquemaSmtp,
} from '@pz/config/env';
import { z } from 'zod';

import { NOMES_FILAS } from './filas/job.js';

/** Ambiente do worker (ADR-010): validado no boot; faltou algo, o processo não sobe. */
export const esquemaWorker = esquemaBase
  .extend(esquemaObservabilidade.shape)
  .extend(esquemaBanco.shape)
  .extend(esquemaRedis.shape)
  .extend(esquemaArmazenamento.shape)
  .extend(esquemaSmtp.shape)
  .extend(esquemaEmail.shape)
  .extend({
    /** Papel pz_sistema (BYPASSRLS): relay do outbox e jobs globais (ADR-003). */
    DATABASE_URL_SISTEMA: z.url({ protocol: /^postgres(ql)?$/ }),
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
      .pipe(z.array(z.enum(NOMES_FILAS))),
    /** Mesma chave da api: decifra o token do link de redefinição de senha (HU06). */
    CHAVE_CIFRAGEM: z
      .base64()
      .refine((valor) => Buffer.from(valor, 'base64').length === 32, 'esperado 32 bytes em base64'),
    /** Endereço do portal nos links dos e-mails. */
    PORTAL_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3001'),
    EMAIL_REMETENTE: z.string().min(3).default('PrejuZero <nao-responda@prejuzero.local>'),
    /** STARTTLS obrigatório no SMTP; só o Mailpit local usa false. */
    SMTP_EXIGIR_TLS: z.stringbool().default(true),
    /** Bucket com object lock da cópia WORM da auditoria (HU08). */
    AUDITORIA_WORM_BUCKET: z.string().min(3).default('pz-auditoria-worm'),
    /**
     * Retenção WORM em dias (modo COMPLIANCE: ninguém apaga antes). Prazo legal a definir pelo
     * responsável jurídico; obrigatório em produção, 1 dia no ambiente local.
     */
    AUDITORIA_WORM_RETENCAO_DIAS: z.coerce.number().int().positive().optional(),
    /** Intervalo do ciclo do relay do outbox. */
    RELAY_INTERVALO_MS: z.coerce.number().int().min(100).default(1_000),
  });

export type AmbienteWorker = z.output<typeof esquemaWorker>;
