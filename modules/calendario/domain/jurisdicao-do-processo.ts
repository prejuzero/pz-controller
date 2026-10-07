import { TRIBUNAIS } from '@pz/kernel';

import type { Jurisdicao } from './dias-nao-uteis.js';

/** Campo da jurisdição que o processo não informa: eventos desse nível ficam de fora. */
export const LACUNAS_DA_JURISDICAO = ['tribunal', 'uf', 'municipio', 'comarca'] as const;
export type LacunaDaJurisdicao = (typeof LACUNAS_DA_JURISDICAO)[number];

/** O que o cadastro sabe do local do processo. */
export interface LocalDoProcesso {
  readonly tribunal: string | null;
  readonly comarca: string | null;
}

export interface JurisdicaoResolvida {
  readonly jurisdicao: Jurisdicao;
  readonly lacunas: readonly LacunaDaJurisdicao[];
}

/**
 * Jurisdição do calendário a partir do processo (HU13). Só usa fatos cadastrados: a sigla do
 * tribunal (deduzida do número CNJ) e a comarca informada. A UF vem da tabela de tribunais quando
 * o tribunal tem uma única UF; com várias, não se escolhe. O processo não guarda o município.
 * Nada é suposto: o que falta vira lacuna, para a tela avisar que feriados desse nível não
 * entram (com menos dias sem contagem, a data sugerida só pode ficar mais cedo, CLAUDE.md §4.4).
 */
export function jurisdicaoDoProcesso(local: LocalDoProcesso): JurisdicaoResolvida {
  const tribunal = TRIBUNAIS.find((t) => t.sigla === local.tribunal);
  const uf = tribunal?.ufs.length === 1 ? tribunal.ufs[0] : undefined;
  const lacunas: LacunaDaJurisdicao[] = [];
  if (tribunal === undefined) lacunas.push('tribunal');
  if (uf === undefined && (tribunal === undefined || tribunal.ufs.length > 1)) lacunas.push('uf');
  lacunas.push('municipio');
  if (local.comarca === null) lacunas.push('comarca');
  return {
    jurisdicao: {
      ...(tribunal === undefined ? {} : { tribunal: tribunal.sigla }),
      ...(uf === undefined ? {} : { uf }),
      ...(local.comarca === null ? {} : { comarca: local.comarca }),
    },
    lacunas,
  };
}
