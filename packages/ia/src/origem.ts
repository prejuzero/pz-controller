import type { ResultadoDaTarefa } from './plataforma.js';
import type { Instant } from '@pz/kernel';

/** Origem de uma sugestão (HU58): o que a interface e a trilha mostram como "sugerido por IA". */
export interface OrigemIa {
  readonly modelo: string;
  readonly provedor: string;
  readonly versaoPrompt: string;
  readonly versaoConfiguracao: string;
  readonly confianca: number | null;
  readonly geradoEm: string;
}

/** Monta a origem a partir do resultado da tarefa; a confiança vem da saída validada, se houver. */
export function origemIa(
  resultado: ResultadoDaTarefa<unknown>,
  geradoEm: Instant,
  confianca?: number,
): OrigemIa {
  if (confianca !== undefined && (confianca < 0 || confianca > 1 || Number.isNaN(confianca))) {
    throw new RangeError('Confiança deve estar entre 0 e 1.');
  }
  return {
    modelo: resultado.modelo,
    provedor: resultado.provedor,
    versaoPrompt: resultado.versaoDoPrompt,
    versaoConfiguracao: resultado.versaoDaConfiguracao,
    confianca: confianca ?? null,
    geradoEm: geradoEm.paraIso(),
  };
}
