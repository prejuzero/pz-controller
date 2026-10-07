import { z } from 'zod';

/**
 * Configuração 12-factor (ADR-010): toda app declara o esquema do ambiente de que precisa
 * e chama `carregarAmbiente` no boot. Se faltar ou estiver inválida qualquer variável,
 * o processo não sobe, e o erro lista todos os problemas sem expor nenhum valor.
 */

export class ErroConfiguracao extends Error {
  readonly problemas: readonly string[];

  constructor(problemas: readonly string[]) {
    super(
      `Configuração de ambiente inválida (${String(problemas.length)} problema(s)):\n` +
        problemas.map((problema) => `  - ${problema}`).join('\n'),
    );
    this.name = 'ErroConfiguracao';
    this.problemas = problemas;
  }
}

const booleano = z.enum(['true', 'false']).transform((valor) => valor === 'true');
const porta = z.coerce.number().int().min(1).max(65_535);

export const esquemaBase = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export const esquemaBanco = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export const esquemaRedis = z.object({
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
});

export const esquemaArmazenamento = z.object({
  /** Vazio em produção na AWS; preenchido para RustFS local ou outro S3-compatível. */
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: booleano.default(false),
  /** Bucket dos arquivos do sistema (exportações LGPD e, depois, anexos). */
  ARQUIVOS_BUCKET: z.string().min(3).default('pz-arquivos'),
});

export const esquemaSmtp = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: porta,
});

/** Opcional em que vazio vale como não definida (ex.: `${VAR:-}` no docker compose). */
function opcional<Esquema extends z.ZodType>(esquema: Esquema) {
  return z.preprocess((valor) => (valor === '' ? undefined : valor), esquema.optional());
}

/** Provedor de e-mail e webhooks de entrega (HU30, ADR-005): trocar de provedor é configuração. */
export const esquemaEmail = z.object({
  EMAIL_PROVEDOR: z.enum(['smtp', 'ses']).default('smtp'),
  SES_REGIAO: z.string().min(1).default('sa-east-1'),
  /** Credenciais SMTP do SES; obrigatórias com EMAIL_PROVEDOR=ses (conferido no boot). */
  SES_SMTP_USUARIO: opcional(z.string().min(1)),
  SES_SMTP_SENHA: opcional(z.string().min(1)),
  /** Tópicos SNS aceitos em /v1/webhooks/ses, separados por vírgula; vazio desliga a rota. */
  SES_TOPICOS_SNS: z
    .string()
    .optional()
    .transform((valor) =>
      (valor ?? '')
        .split(',')
        .map((topico) => topico.trim())
        .filter((topico) => topico.length > 0),
    )
    .pipe(z.array(z.string().regex(/^arn:aws:sns:[a-z0-9-]+:\d{12}:[\w-]+$/))),
});

export const esquemaObservabilidade = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: opcional(z.url({ protocol: /^https?$/ })),
  /** Sem DSN, a captura de erros no Sentry fica desligada (ADR-011). */
  SENTRY_DSN: opcional(z.url({ protocol: /^https$/ })),
});

export type FonteAmbiente = Readonly<Record<string, string | undefined>>;

/** Mensagens sem o valor recebido: nunca vazam segredos em logs ou no terminal. */
function descreverProblema(problema: z.core.$ZodIssue): string {
  const variavel = problema.path.map(String).join('.') || '(raiz)';
  if (problema.code === 'invalid_type' && problema.input === undefined) {
    return `${variavel}: obrigatória e não definida`;
  }
  switch (problema.code) {
    case 'invalid_value':
      return `${variavel}: valor fora das opções permitidas`;
    case 'invalid_format':
      return `${variavel}: formato inválido (${problema.format})`;
    case 'too_small':
    case 'too_big':
      return `${variavel}: valor fora dos limites permitidos`;
    default:
      return `${variavel}: valor inválido`;
  }
}

export function carregarAmbiente<Esquema extends z.ZodType>(
  esquema: Esquema,
  fonte: FonteAmbiente = process.env,
): z.output<Esquema> {
  const resultado = esquema.safeParse(fonte, { reportInput: true });
  if (!resultado.success) {
    throw new ErroConfiguracao(resultado.error.issues.map(descreverProblema));
  }
  return resultado.data;
}
