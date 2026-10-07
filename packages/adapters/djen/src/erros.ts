import {
  ErroLimiteExcedido,
  ErroPermanente,
  ErroTransitorio,
  type ErroIntegracao,
} from '@pz/integracoes';

export const ID_DJEN = 'djen';

/**
 * Status HTTP do DJEN na classificação padrão (camada anticorrupção): 429 é cota, 5xx é
 * passageiro e os demais 4xx são pedido inválido, que repetir não resolve.
 */
export function classificarStatusDjen(status: number, repetirApos: string | null): ErroIntegracao {
  const mensagem = `DJEN respondeu HTTP ${String(status)}`;
  if (status === 429) {
    const segundos = repetirApos === null ? Number.NaN : Number(repetirApos);
    return new ErroLimiteExcedido(
      mensagem,
      ID_DJEN,
      Number.isFinite(segundos) && segundos >= 0 ? { repetirAposMs: segundos * 1000 } : {},
    );
  }
  if (status >= 500) return new ErroTransitorio(mensagem, ID_DJEN);
  return new ErroPermanente(mensagem, ID_DJEN);
}

/** Falha antes da resposta: rede, DNS, conexão recusada ou abortada pelo timeout. */
export function classificarFalhaDeRede(erro: unknown): ErroIntegracao {
  return new ErroTransitorio('DJEN inalcançável', ID_DJEN, { causa: erro });
}
