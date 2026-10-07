import { z } from 'zod';

/**
 * Configuração versionada das tarefas de IA (ADR-016): modelo primário e fallbacks, temperatura,
 * limite de tokens, cache de prompt e lote. Trocar o modelo de uma tarefa é mudar este arquivo e
 * rodar a avaliação (`pnpm eval`), sem mudar código.
 */
const ModeloDaTarefa = z
  .object({
    /** ID do adaptador de ProvedorIA (ex.: `anthropic`). */
    provedor: z.string().regex(/^[a-z][a-z0-9-]*$/),
    modelo: z.string().min(1),
  })
  .strict();

const Tarefa = z
  .object({
    descricao: z.string().min(1),
    /** Ordem de preferência: o primeiro é o primário; os seguintes, fallback. */
    modelos: z.array(ModeloDaTarefa).min(1),
    temperatura: z.number().min(0).max(1).optional(),
    maxTokensSaida: z.number().int().positive().max(64_000),
    /** Marca o bloco estável (sistema) para cache no provedor. */
    cachePrompt: z.boolean(),
    /** Permite processamento em lote (assíncrono e mais barato). */
    lote: z.boolean(),
    /** Recusa datas na saída (ADR-008), exceto nos campos de trecho literal do documento. */
    saidaSemDatas: z
      .object({ excetoCampos: z.array(z.string()) })
      .strict()
      .optional(),
    /** Tokens (entrada + saída) por tenant e mês; alerta a 80%, recusa a partir de 100%. */
    orcamentoMensalTokens: z.number().int().positive().optional(),
  })
  .strict();

export const ConfiguracaoDasTarefas = z
  .object({
    versao: z.string().min(1),
    tarefas: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), Tarefa),
  })
  .strict();
export type ConfiguracaoDasTarefas = z.infer<typeof ConfiguracaoDasTarefas>;
export type ConfiguracaoDaTarefa = z.infer<typeof Tarefa>;

/** Valida a configuração no boot: erro de configuração derruba o processo, nunca em silêncio. */
export function lerConfiguracaoDasTarefas(bruta: unknown): ConfiguracaoDasTarefas {
  return ConfiguracaoDasTarefas.parse(bruta);
}
