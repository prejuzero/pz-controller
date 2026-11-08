import { esquemaBase, esquemaObservabilidade } from '@pz/config/env';
import { z } from 'zod';

/** Ambiente do servidor MCP (HU60): só fala com a API /v1, nunca com o banco (ADR-015). */
export const esquemaMcp = esquemaBase.extend(esquemaObservabilidade.shape).extend({
  MCP_PORTA: z.coerce.number().int().min(1).max(65_535).default(3004),
  /** Base da API (ex.: http://api:3001 na rede interna). */
  MCP_API_URL: z.url({ protocol: /^https?$/ }).default('http://127.0.0.1:3000'),
  VERSAO: z.string().min(1).default('dev'),
});
export type AmbienteMcp = z.infer<typeof esquemaMcp>;
