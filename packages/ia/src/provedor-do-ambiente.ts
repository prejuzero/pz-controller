import type { Logger } from '@pz/observability';

/** Variáveis de ambiente que escolhem o provedor de IA (as mesmas na API e no worker). */
export interface AmbienteDaIa {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly GEMINI_API_KEY?: string | undefined;
  readonly GEMINI_MODELO: string;
  readonly IA_DADOS_FICTICIOS: 'sim' | 'nao';
}

export type ProvedorIaEscolhido =
  { tipo: 'anthropic'; chave: string } | { tipo: 'gemini'; chave: string; modelo: string };

/**
 * Provedor de IA do ambiente: Anthropic (padrão do produto) ou, só na validação local com dados
 * fictícios, o Gemini (ADR-022). Nenhum dos dois: `undefined` e a IA fica desligada.
 */
export function escolherProvedorIa(
  ambiente: AmbienteDaIa,
  logger: Pick<Logger, 'warn'>,
): ProvedorIaEscolhido | undefined {
  if (ambiente.ANTHROPIC_API_KEY !== undefined) {
    return { tipo: 'anthropic', chave: ambiente.ANTHROPIC_API_KEY };
  }
  if (ambiente.GEMINI_API_KEY === undefined) {
    logger.warn('sem chave de IA: IA desligada (só regras rápidas)');
    return undefined;
  }
  if (ambiente.IA_DADOS_FICTICIOS !== 'sim') {
    // Plano gratuito pode treinar com o conteúdo: sem a declaração, não liga (CLAUDE.md, 11).
    logger.warn(
      'GEMINI_API_KEY sem IA_DADOS_FICTICIOS=sim: Gemini não ligado (só com dados fictícios)',
    );
    return undefined;
  }
  logger.warn(
    { modelo: ambiente.GEMINI_MODELO },
    'IA pelo Gemini (ADR-022): só para validação local com dados fictícios',
  );
  return { tipo: 'gemini', chave: ambiente.GEMINI_API_KEY, modelo: ambiente.GEMINI_MODELO };
}
