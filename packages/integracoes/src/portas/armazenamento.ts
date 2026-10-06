import { z } from 'zod';

import { Instante } from '../canonicos.js';

import type { SaudeAdaptador } from '../canonicos.js';
import type { Uuid } from '@pz/kernel';

/**
 * Caminho do arquivo dentro do tenant: segmentos simples, sem `..`, sem barra inicial.
 * O adaptador sempre prefixa com o tenant: um tenant nunca alcança arquivo de outro.
 */
export const CaminhoArquivo = z
  .string()
  .min(1)
  .max(900)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/, {
    message: 'caminho inválido (segmentos simples, sem barra inicial)',
  })
  .refine((caminho) => !caminho.split('/').includes('..'), { message: 'caminho com ..' });

/** Chave completa no armazenamento: `<tenant>/<caminho>`. */
export function chaveDoArquivo(tenantId: Uuid, caminho: string): string {
  return `${tenantId}/${CaminhoArquivo.parse(caminho)}`;
}

export const MetadadosArquivo = z
  .object({
    tamanhoBytes: z.number().int().nonnegative(),
    tipoMime: z.string().min(1),
    atualizadoEm: Instante,
  })
  .strict();
export type MetadadosArquivo = z.infer<typeof MetadadosArquivo>;

export interface ArquivoParaGravar {
  readonly tenantId: Uuid;
  readonly caminho: string;
  readonly conteudo: Uint8Array;
  readonly tipoMime: string;
}

export interface PedidoUrlAssinada {
  readonly tenantId: Uuid;
  readonly caminho: string;
  readonly operacao: 'upload' | 'download';
  readonly expiraEmSegundos: number;
  /** Tipo exigido no upload (o provedor recusa outro). */
  readonly tipoMime?: string;
}

/** Armazenamento de arquivos S3-compatível (RustFS local, S3 em produção; ADR-010/017). */
export interface ArmazenamentoArquivos {
  gravar(arquivo: ArquivoParaGravar): Promise<void>;
  urlAssinada(pedido: PedidoUrlAssinada): Promise<string>;
  remover(tenantId: Uuid, caminho: string): Promise<void>;
  /** Metadados do arquivo, ou undefined se não existir. */
  metadados(tenantId: Uuid, caminho: string): Promise<MetadadosArquivo | undefined>;
  saude(): Promise<SaudeAdaptador>;
}
