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

/** Provedor de IA (HU21, ADR-022), o mesmo na API (cadastro assistido) e no worker. */
export const esquemaIa = z.object({
  /**
   * Ordem dos provedores de IA (ADR-024), separados por vírgula: o primeiro com chave atende e os
   * seguintes são o fallback. Sem chave nenhuma, a IA fica desligada e o que as regras rápidas
   * não classificam fica "a confirmar".
   */
  IA_PROVEDORES: z
    .string()
    .default('anthropic,openai,gemini')
    .transform((valor) =>
      valor
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p !== ''),
    )
    .pipe(z.array(z.enum(['anthropic', 'openai', 'gemini'])).min(1)),
  /** Chave da API da Anthropic (HU21): a API não usa os dados para treino. */
  ANTHROPIC_API_KEY: opcional(z.string().min(1)),
  /** Chave da API da OpenAI (ADR-024): a API não usa os dados para treino por padrão. */
  OPENAI_API_KEY: opcional(z.string().min(1)),
  OPENAI_MODELO: z.string().min(1).default('gpt-5-mini'),
  /** Chave do Google Gemini (ADR-022, ADR-024). */
  GEMINI_API_KEY: opcional(z.string().min(1)),
  GEMINI_MODELO: z.string().min(1).default('gemini-3.5-flash'),
  /**
   * "pago" só com o faturamento ativo no projeto da chave (no plano pago o Google não usa os dados
   * para treino); aí o Gemini recebe dados reais. "gratuito": só com IA_DADOS_FICTICIOS=sim.
   */
  GEMINI_PLANO: z.enum(['gratuito', 'pago']).default('gratuito'),
  /** Declaração de quem liga o Gemini gratuito: o banco local só tem dados fictícios. */
  IA_DADOS_FICTICIOS: z.enum(['sim', 'nao']).default('nao'),
  /**
   * Orçamento diário de IA da plataforma em US$ (HU21), pelo custo estimado de tabela. Acima
   * dele, alerta uma vez por dia; não bloqueia (o bloqueio é o orçamento mensal por tarefa).
   */
  IA_ORCAMENTO_DIARIO_USD: z.coerce.number().positive().default(20),
});

export const esquemaArmazenamento = z.object({
  /** Vazio em produção na AWS; preenchido para RustFS local ou outro S3-compatível. */
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  /** Endpoint alcançável pelo navegador nas URLs assinadas (compose); vazio: o mesmo S3_ENDPOINT. */
  S3_ENDPOINT_PUBLICO: z.url({ protocol: /^https?$/ }).optional(),
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
