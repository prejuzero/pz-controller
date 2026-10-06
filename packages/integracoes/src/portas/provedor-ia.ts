import { z } from 'zod';

import type { SaudeAdaptador } from '../canonicos.js';

export const MensagemIA = z
  .object({ papel: z.enum(['usuario', 'assistente']), conteudo: z.string().min(1) })
  .strict();
export type MensagemIA = z.infer<typeof MensagemIA>;

export const PromptIA = z
  .object({
    /** Versão do prompt no registro versionado de `packages/ia` (registrada em toda chamada). */
    versao: z.string().min(1),
    sistema: z.string().min(1),
    mensagens: z.array(MensagemIA).min(1),
  })
  .strict();
export type PromptIA = z.infer<typeof PromptIA>;

export interface FerramentaIA {
  readonly nome: string;
  readonly descricao: string;
  /** JSON Schema da entrada (gerado do schema Zod do catálogo de ferramentas). */
  readonly entrada: Record<string, unknown>;
}

export interface OpcoesIA {
  readonly modelo: string;
  readonly maxTokensSaida: number;
  readonly temperatura?: number;
  readonly ferramentas?: readonly FerramentaIA[];
  /** Marca o prompt de sistema para cache no provedor, quando suportado. */
  readonly cachePrompt?: boolean;
}

export interface UsoIA {
  readonly tokensEntrada: number;
  readonly tokensSaida: number;
  readonly tokensCacheLidos: number;
}

export interface RespostaIA<Saida> {
  /** Saída já validada pelo schema; inválida vira erro, nunca dado (CLAUDE.md, 11). */
  readonly saida: Saida;
  readonly modelo: string;
  readonly uso: UsoIA;
  readonly chamadasDeFerramenta: readonly { readonly nome: string; readonly entrada: unknown }[];
}

/**
 * Provedor de modelo de IA. Só `packages/ia` o usa (roteamento, prompts versionados, guardrails,
 * custo, observabilidade). A IA nunca devolve datas de prazo (ADR-008): o schema de saída de
 * quem chama não tem campos de data.
 */
export interface ProvedorIA {
  gerarEstruturado<Saida>(
    prompt: PromptIA,
    schema: z.ZodType<Saida>,
    opcoes: OpcoesIA,
  ): Promise<RespostaIA<Saida>>;
  /** Envia um lote para processamento assíncrono (mais barato); devolve o ID do lote. */
  enviarLote?(
    itens: readonly { readonly id: string; readonly prompt: PromptIA; readonly opcoes: OpcoesIA }[],
  ): Promise<string>;
  saude(): Promise<SaudeAdaptador>;
}
