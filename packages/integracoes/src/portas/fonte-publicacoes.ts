import { z } from 'zod';

import { DataJuridica, NumeroCnj, Oab } from '../canonicos.js';

import type { JanelaDeBusca, SaudeAdaptador } from '../canonicos.js';

/**
 * Publicação como sai de qualquer fonte (DJEN, DataJud, tribunais), já no modelo canônico.
 * O teor é dado, não instrução (CLAUDE.md, 11): quem consome isola o texto antes de usar IA.
 */
export const PublicacaoCapturada = z
  .object({
    /** ID do adaptador de origem (ex.: `djen`). */
    fonte: z.string().min(1),
    /** ID da publicação no provedor: chave de idempotência da captura. */
    idExterno: z.string().min(1).max(200),
    /** SHA-256 do teor normalizado (hex): deduplica o conteúdo entre fontes (ADR-014). */
    hashConteudo: z.string().regex(/^[0-9a-f]{64}$/),
    /** Data de disponibilização informada pela fonte; o motor de prazos decide o que fazer com ela. */
    dataDisponibilizacao: DataJuridica,
    teor: z.string().min(1),
    numeroCnj: NumeroCnj.optional(),
    destinatarios: z.array(z.object({ oab: Oab }).strict()),
    urlFonte: z.url(),
    /** Campos próprios da fonte, preservados para auditoria e reprocessamento. */
    metadados: z.record(z.string(), z.unknown()),
  })
  .strict();
export type PublicacaoCapturada = z.infer<typeof PublicacaoCapturada>;

/** Fonte de publicações. Só lê listas: nunca abre o expediente (dispararia a ciência). */
export interface FontePublicacoes {
  buscarPorOab(oab: Oab, janela: JanelaDeBusca): Promise<PublicacaoCapturada[]>;
  buscarPorProcesso(numeroCnj: NumeroCnj, janela: JanelaDeBusca): Promise<PublicacaoCapturada[]>;
  saude(): Promise<SaudeAdaptador>;
}
