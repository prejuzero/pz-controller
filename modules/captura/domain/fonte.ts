/**
 * Saúde da fonte de publicações (HU19). A fonte fica "degradada" depois de falhas seguidas que
 * indicam indisponibilidade (não cota nem erro de um alvo só) e volta a "operacional" no primeiro
 * sucesso. A transição é o que gera alerta, aviso e recaptura: repetir o estado não gera nada.
 */
export const SITUACOES_DA_FONTE = ['operacional', 'degradada'] as const;
export type SituacaoDaFonte = (typeof SITUACOES_DA_FONTE)[number];

/** Falhas seguidas da fonte até considerá-la degradada. */
export const FALHAS_PARA_DEGRADAR = 3;
/** Falhas seguidas de um alvo até o alerta específico (o alvo pode estar errado, não a fonte). */
export const FALHAS_PARA_ALERTAR_ALVO = 5;

export interface EstadoDaFonte {
  readonly situacao: SituacaoDaFonte;
  readonly falhasConsecutivas: number;
}

export type TransicaoDaFonte = 'degradou' | 'restabeleceu' | 'nenhuma';

export interface Mudanca {
  readonly estado: EstadoDaFonte;
  readonly transicao: TransicaoDaFonte;
}

export function aposFalhaDaFonte(atual: EstadoDaFonte): Mudanca {
  const falhas = atual.falhasConsecutivas + 1;
  const degradou = atual.situacao === 'operacional' && falhas >= FALHAS_PARA_DEGRADAR;
  return {
    estado: { situacao: degradou ? 'degradada' : atual.situacao, falhasConsecutivas: falhas },
    transicao: degradou ? 'degradou' : 'nenhuma',
  };
}

export function aposSucessoDaFonte(atual: EstadoDaFonte): Mudanca {
  return {
    estado: { situacao: 'operacional', falhasConsecutivas: 0 },
    transicao: atual.situacao === 'degradada' ? 'restabeleceu' : 'nenhuma',
  };
}

/** Alerta do alvo uma vez por sequência de falhas, ao atingir o limite. */
export const alvoPrecisaDeAlerta = (falhas: number): boolean => falhas === FALHAS_PARA_ALERTAR_ALVO;
