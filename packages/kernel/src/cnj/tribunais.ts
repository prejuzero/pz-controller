import type { PartesDoNumeroCnj } from './numero-cnj.js';

/**
 * Tabela de referência dos tribunais (HU12): base para o tribunal deduzido do número CNJ, o
 * calendário forense e os conectores da F2. Segmento (J) e código (TR) seguem a Resolução CNJ
 * 65/2008; a sigla é a usada no calendário (ex.: TJSP). Dados versionados no código: mudança
 * (ex.: tribunal novo) é PR revisado.
 */
export const RAMOS = [
  'superior',
  'federal',
  'trabalho',
  'eleitoral',
  'militar-uniao',
  'estadual',
  'militar-estadual',
] as const;
export type Ramo = (typeof RAMOS)[number];

export const SISTEMAS_PROCESSUAIS = ['pje', 'eproc', 'esaj', 'projudi', 'outro'] as const;
export type SistemaProcessual = (typeof SISTEMAS_PROCESSUAIS)[number];

export interface Tribunal {
  readonly sigla: string;
  readonly segmento: string;
  readonly codigoTr: string;
  /** UFs da jurisdição; vazio nos tribunais com jurisdição nacional. */
  readonly ufs: readonly string[];
  readonly ramo: Ramo;
  /**
   * Sistemas em uso. Vazio = não cadastrado: preencher só com fonte oficial do tribunal (os
   * tribunais migram de sistema e muitos usam mais de um).
   */
  readonly sistemas: readonly SistemaProcessual[];
}

/** Código TR dos tribunais por UF (TJ, TRE e TJM): ordem alfabética dos nomes dos estados. */
const CODIGO_DA_UF: readonly (readonly [string, string])[] = [
  ['01', 'AC'],
  ['02', 'AL'],
  ['03', 'AP'],
  ['04', 'AM'],
  ['05', 'BA'],
  ['06', 'CE'],
  ['07', 'DF'],
  ['08', 'ES'],
  ['09', 'GO'],
  ['10', 'MA'],
  ['11', 'MT'],
  ['12', 'MS'],
  ['13', 'MG'],
  ['14', 'PA'],
  ['15', 'PB'],
  ['16', 'PR'],
  ['17', 'PE'],
  ['18', 'PI'],
  ['19', 'RJ'],
  ['20', 'RN'],
  ['21', 'RS'],
  ['22', 'RO'],
  ['23', 'RR'],
  ['24', 'SC'],
  ['25', 'SE'],
  ['26', 'SP'],
  ['27', 'TO'],
];

const TRFS: readonly (readonly string[])[] = [
  ['AC', 'AM', 'AP', 'BA', 'DF', 'GO', 'MA', 'MT', 'PA', 'PI', 'RO', 'RR', 'TO'],
  ['ES', 'RJ'],
  ['MS', 'SP'],
  ['PR', 'RS', 'SC'],
  ['AL', 'CE', 'PB', 'PE', 'RN', 'SE'],
  // TRF6: Lei 14.226/2021.
  ['MG'],
];

const TRTS: readonly (readonly string[])[] = [
  ['RJ'],
  ['SP'],
  ['MG'],
  ['RS'],
  ['BA'],
  ['PE'],
  ['CE'],
  ['AP', 'PA'],
  ['PR'],
  ['DF', 'TO'],
  ['AM', 'RR'],
  ['SC'],
  ['PB'],
  ['AC', 'RO'],
  ['SP'],
  ['MA'],
  ['ES'],
  ['GO'],
  ['AL'],
  ['SE'],
  ['RN'],
  ['PI'],
  ['MT'],
  ['MS'],
];

const codigo = (n: number) => String(n).padStart(2, '0');

const superior = (sigla: string, segmento: string): Tribunal => ({
  sigla,
  segmento,
  codigoTr: '00',
  ufs: [],
  ramo: 'superior',
  sistemas: [],
});

export const TRIBUNAIS: readonly Tribunal[] = [
  superior('STF', '1'),
  superior('STJ', '3'),
  superior('TST', '5'),
  superior('TSE', '6'),
  superior('STM', '7'),
  ...TRFS.map((ufs, i) => ({
    sigla: `TRF${String(i + 1)}`,
    segmento: '4',
    codigoTr: codigo(i + 1),
    ufs,
    ramo: 'federal' as const,
    sistemas: [],
  })),
  // A Justiça do Trabalho tramita no PJe-JT em todos os TRTs.
  ...TRTS.map((ufs, i) => ({
    sigla: `TRT${String(i + 1)}`,
    segmento: '5',
    codigoTr: codigo(i + 1),
    ufs,
    ramo: 'trabalho' as const,
    sistemas: ['pje' as const],
  })),
  ...CODIGO_DA_UF.map(([codigoTr, uf]) => ({
    sigla: `TRE-${uf}`,
    segmento: '6',
    codigoTr,
    ufs: [uf],
    ramo: 'eleitoral' as const,
    sistemas: [],
  })),
  ...CODIGO_DA_UF.map(([codigoTr, uf]) => ({
    sigla: uf === 'DF' ? 'TJDFT' : `TJ${uf}`,
    segmento: '8',
    codigoTr,
    ufs: [uf],
    ramo: 'estadual' as const,
    sistemas: [],
  })),
  // Só MG, RS e SP têm Tribunal de Justiça Militar.
  ...CODIGO_DA_UF.filter(([, uf]) => ['MG', 'RS', 'SP'].includes(uf)).map(([codigoTr, uf]) => ({
    sigla: `TJM${uf}`,
    segmento: '9',
    codigoTr,
    ufs: [uf],
    ramo: 'militar-estadual' as const,
    sistemas: [],
  })),
];

const POR_CODIGO = new Map(TRIBUNAIS.map((t) => [`${t.segmento}.${t.codigoTr}`, t]));

/**
 * Tribunal deduzido do número (segmento J + código TR). undefined quando a combinação não está
 * na tabela (ex.: conselhos, auditorias da Justiça Militar da União): o cadastro segue, sem
 * tribunal deduzido.
 */
export function tribunalDoNumero(
  partes: Pick<PartesDoNumeroCnj, 'segmento' | 'tribunal'>,
): Tribunal | undefined {
  return POR_CODIGO.get(`${partes.segmento}.${partes.tribunal}`);
}
