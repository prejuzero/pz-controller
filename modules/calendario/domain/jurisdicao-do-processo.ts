import { TRIBUNAIS } from '@pz/kernel';

import municipios from './municipios-das-comarcas.json' with { type: 'json' };

import type { Jurisdicao } from './dias-nao-uteis.js';

/**
 * UF -> nome normalizado -> código IBGE, gerado de docs/curadoria/carga/gerar_carga.py a partir do
 * cadastro territorial da curadoria (planilha V2, aba 5: comarcas dos TJs e municípios dos
 * feriados municipais, com o código IBGE). Nome ambíguo na mesma UF já fica de fora.
 */
const MUNICIPIOS: Readonly<Record<string, Readonly<Record<string, string>>>> = municipios;

/** Mesma normalização do gerador: sem acento, minúsculo, sem "Comarca de", "Vara do Trabalho de"... */
export function normalizarMunicipio(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^(comarca|foro|vara|subsecao|secao)( judiciaria)?( do trabalho)? de /, '')
    .replace(/\s+/g, ' ');
}

/**
 * Município da comarca nas UFs do tribunal: só com uma correspondência exata (nome repetido em duas
 * UFs do mesmo tribunal não é escolhido).
 */
function municipioDaComarca(ufs: readonly string[], comarca: string) {
  const nome = normalizarMunicipio(comarca);
  const achados = ufs.flatMap((uf) => {
    const ibge = MUNICIPIOS[uf]?.[nome];
    return ibge === undefined ? [] : [{ uf, municipioIbge: ibge }];
  });
  return achados.length === 1 ? achados[0] : undefined;
}

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
 * tribunal (deduzida do número CNJ), a comarca informada e o cadastro territorial da curadoria.
 * O município sai do nome da comarca dentro das UFs do tribunal (e dá a UF quando o tribunal tem
 * várias); sem correspondência única, não se escolhe. Nada é suposto: o que falta vira lacuna,
 * para a tela avisar que feriados desse nível não entram (com menos dias sem contagem, a data
 * sugerida só pode ficar mais cedo, CLAUDE.md §4.4).
 */
export function jurisdicaoDoProcesso(local: LocalDoProcesso): JurisdicaoResolvida {
  const tribunal = TRIBUNAIS.find((t) => t.sigla === local.tribunal);
  const municipio =
    tribunal === undefined || local.comarca === null
      ? undefined
      : municipioDaComarca(tribunal.ufs, local.comarca);
  const uf = municipio?.uf ?? (tribunal?.ufs.length === 1 ? tribunal.ufs[0] : undefined);
  const lacunas: LacunaDaJurisdicao[] = [];
  if (tribunal === undefined) lacunas.push('tribunal');
  // Tribunal superior não tem UF: não é lacuna.
  if (uf === undefined && (tribunal === undefined || tribunal.ufs.length > 0)) lacunas.push('uf');
  if (municipio === undefined) lacunas.push('municipio');
  if (local.comarca === null) lacunas.push('comarca');
  return {
    jurisdicao: {
      ...(tribunal === undefined ? {} : { tribunal: tribunal.sigla }),
      ...(uf === undefined ? {} : { uf }),
      ...(municipio === undefined ? {} : { municipioIbge: municipio.municipioIbge }),
      ...(local.comarca === null ? {} : { comarca: local.comarca }),
    },
    lacunas,
  };
}
