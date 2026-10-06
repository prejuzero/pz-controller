import { z } from 'zod';

/** Portas de integração (ADR-005). Previstas: cofre de segredos, identidade, cobrança, extrator. */
export const NOMES_PORTAS = [
  'fonte-publicacoes',
  'canal-notificacao',
  'provedor-email',
  'provedor-ia',
  'armazenamento-arquivos',
] as const;
export const NomePorta = z.enum(NOMES_PORTAS);
export type NomePorta = z.infer<typeof NomePorta>;

/**
 * Descritor de um adaptador: quem é, que porta implementa, o que sabe fazer e quais limites o
 * provedor impõe. O registro usa os limites para configurar a resiliência; a interface usa as
 * capacidades para mostrar ao usuário o que é coberto automaticamente (CLAUDE.md, 2.6).
 */
export const DescritorAdaptador = z
  .object({
    /** ID estável, usado na configuração, nas métricas e na rota de webhook. */
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    porta: NomePorta,
    versao: z.string().regex(/^\d+\.\d+\.\d+$/),
    capacidades: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
    limites: z
      .object({
        /** Cota do provedor, compartilhada por todas as instâncias (rate limit distribuído). */
        requisicoesPorMinuto: z.number().int().positive().optional(),
        /** Chamadas simultâneas por instância (bulkhead). */
        concorrencia: z.number().int().positive().optional(),
        /** Tempo máximo de uma tentativa. */
        timeoutMs: z.number().int().positive().optional(),
      })
      .strict(),
    requerCredenciais: z.boolean(),
  })
  .strict();
export type DescritorAdaptador = z.infer<typeof DescritorAdaptador>;

/** Valida o descritor na declaração do adaptador (erro de programação falha cedo). */
export function definirDescritor(descritor: DescritorAdaptador): DescritorAdaptador {
  return Object.freeze(DescritorAdaptador.parse(descritor));
}
