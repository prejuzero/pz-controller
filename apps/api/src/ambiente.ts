import {
  esquemaArmazenamento,
  esquemaBanco,
  esquemaBase,
  esquemaEmail,
  esquemaIa,
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
  .extend(esquemaEmail.shape)
  .extend(esquemaIa.shape)
  .extend({
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    /**
     * Tenant técnico da plataforma (HU38): contexto das leituras públicas de tabelas globais,
     * como os documentos legais. Padrão: o do seed local.
     */
    TENANT_PLATAFORMA_ID: z.uuid().default('01a10e00-0000-7000-8000-00000000c001'),
    /** Fonte de publicações da captura (HU19), a mesma do worker: o status mostra a saúde dela. */
    CAPTURA_FONTE: z.enum(['djen']).default('djen'),
    /**
     * Endereço público do portal (HU60): tela de consentimento e rotas /v1 que os assistentes
     * descobrem nos metadados OAuth (o portal encaminha /v1 para a API).
     */
    PORTAL_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3001'),
    /**
     * Endereços de retorno do app oficial (HU65), separados por vírgula: esquema privado do app
     * em domínio reverso (RFC 8252, 7.1) ou HTTPS. Comparados por igualdade exata.
     */
    APP_OAUTH_REDIRECT_URIS: z
      .string()
      .default('br.com.prejuzero.app:/oauth/retorno')
      .transform((valor) =>
        valor
          .split(',')
          .map((uri) => uri.trim())
          .filter((uri) => uri !== ''),
      )
      .pipe(
        z
          .array(
            z
              .string()
              .regex(
                /^(?:[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+:\/[^/#\s][^#\s]*|https:\/\/[^#\s]+)$/,
                'esquema do app em domínio reverso (ex.: br.com.prejuzero.app:/oauth/retorno) ou https',
              ),
          )
          .min(1)
          .max(5),
      ),
    /** Versão implantada (SHA do commit), gravada na imagem pelo build. */
    VERSAO: z.string().min(1).default('dev'),
    /**
     * Origens aceitas em chamadas de outro domínio (HU37), separadas por vírgula. Vazio: nenhuma
     * (o portal usa a mesma origem).
     */
    CORS_ORIGENS: z.string().optional(),
    /** Limite global de requisições por IP e por escritório, por minuto (HU37). */
    LIMITE_POR_IP_POR_MINUTO: z.coerce.number().int().min(1).default(600),
    LIMITE_POR_TENANT_POR_MINUTO: z.coerce.number().int().min(1).default(3_000),
    /**
     * Chaves de dados (ADR-021): "id:base64,id:base64", a primeira cifra e as demais só decifram
     * (rotação). Vazio: uma chave derivada da CHAVE_CIFRAGEM (local).
     */
    CHAVES_DE_DADOS: z.string().optional(),
    /** Chave AES-256 (32 bytes em base64) que cifra segredos da aplicação, como o do 2FA. */
    CHAVE_CIFRAGEM: z
      .base64()
      .refine((valor) => Buffer.from(valor, 'base64').length === 32, 'esperado 32 bytes em base64'),
  });

export type AmbienteApi = z.output<typeof esquemaApi>;
