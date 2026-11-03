import { formatarNumeroCnj, lerNumeroCnj } from '@pz/kernel';

/** Relatórios do MVP (HU29, RF55–RF57): agenda de prazos e o resultado de qualquer busca. */
export const TIPOS_DE_RELATORIO = [
  'agenda',
  'busca-prazos',
  'busca-publicacoes',
  'controle-ciencia',
] as const;
export type TipoDeRelatorio = (typeof TIPOS_DE_RELATORIO)[number];

/** Formatos do MVP; CSV e .ics entram como novos renderizadores (F2). */
export const FORMATOS = ['pdf', 'xlsx'] as const;
export type Formato = (typeof FORMATOS)[number];

export const SITUACOES = ['pendente', 'concluido', 'falhou'] as const;
export type SituacaoDoRelatorio = (typeof SITUACOES)[number];

/** Teto de linhas por relatório (aceite: 5.000 linhas em menos de 30 s). */
export const MAXIMO_DE_LINHAS = 5_000;

/** Prazo como a busca devolve (contrato `Prazo`), só os campos que o relatório usa. */
export interface PrazoDoRelatorio {
  readonly id: string;
  readonly vencimento: string | null;
  readonly inicio: string | null;
  readonly tipoAto: string;
  readonly status: string;
  readonly statusCiencia: string;
  readonly fundamento: string | null;
  readonly vencimentoManual: boolean;
  readonly jurisdicao: { readonly tribunal?: string | undefined };
}

/** Publicação como a busca devolve (contrato `PublicacaoDoTenant`). */
export interface PublicacaoDoRelatorio {
  readonly dataDisponibilizacao: string;
  readonly numeroCnj: string | null;
  readonly siglaTribunal: string | null;
  readonly teor: string;
}

export interface Coluna {
  readonly chave: string;
  readonly titulo: string;
  /** Peso da largura no PDF (proporcional). */
  readonly largura: number;
}

export type Linha = Readonly<Record<string, string>>;

export interface Grupo {
  /** Título do grupo (ex.: o dia na agenda); `null`: lista corrida. */
  readonly titulo: string | null;
  readonly linhas: readonly Linha[];
}

/**
 * Documento independente do formato: o que os renderizadores desenham. O cabeçalho leva data,
 * hora, usuário e o filtro usado (RF61).
 */
export interface Documento {
  readonly titulo: string;
  readonly cabecalho: {
    readonly geradoEm: string;
    readonly usuario: string;
    readonly filtros: readonly (readonly [string, string])[];
    /** Aviso quando o resultado passou do teto de linhas. */
    readonly aviso: string | null;
  };
  readonly colunas: readonly Coluna[];
  /** Nome do agrupamento (ex.: "Vencimento"): vira a primeira coluna na planilha. */
  readonly rotuloDoGrupo: string | null;
  readonly grupos: readonly Grupo[];
}

const STATUS: Readonly<Record<string, string>> = {
  'a-confirmar': 'A confirmar',
  pendente: 'Pendente',
  cumprido: 'Cumprido',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};
const CIENCIA: Readonly<Record<string, string>> = {
  pendente: 'Pendente',
  confirmada: 'Confirmada',
};
/** Trecho do teor, como na tela de busca. */
const TRECHO = 300;

/** DD/MM/AAAA de uma data civil, sem conversão de fuso (ADR-013). */
export function dataCivil(iso: string | null): string {
  if (iso === null) return '';
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return p === null ? iso : `${p[3] ?? ''}/${p[2] ?? ''}/${p[1] ?? ''}`;
}

const COLUNAS_PRAZO: readonly Coluna[] = [
  { chave: 'vencimento', titulo: 'Vencimento', largura: 1.2 },
  { chave: 'ato', titulo: 'Ato', largura: 2 },
  { chave: 'situacao', titulo: 'Situação', largura: 1.2 },
  { chave: 'ciencia', titulo: 'Ciência', largura: 1 },
  { chave: 'tribunal', titulo: 'Tribunal', largura: 1 },
];

function linhaDoPrazo(p: PrazoDoRelatorio): Linha {
  return {
    vencimento:
      p.vencimento === null
        ? 'Sem data'
        : `${dataCivil(p.vencimento)}${p.vencimentoManual ? ' (manual)' : ''}`,
    ato: p.tipoAto,
    situacao: STATUS[p.status] ?? p.status,
    ciencia: CIENCIA[p.statusCiencia] ?? p.statusCiencia,
    tribunal: p.jurisdicao.tribunal ?? '',
  };
}

/** Busca de prazos (RF57): as colunas da tela de busca, na ordem da busca. */
export function linhasDaBuscaDePrazos(prazos: readonly PrazoDoRelatorio[]) {
  return {
    colunas: COLUNAS_PRAZO,
    rotuloDoGrupo: null,
    grupos: [{ titulo: null, linhas: prazos.map(linhaDoPrazo) }],
  };
}

/**
 * Agenda de prazos (RF56): agrupada pelo dia do vencimento, com a memória resumida (início e
 * fundamento). Datas e fundamento vêm do motor, gravados no prazo; aqui só se formatam.
 */
export function linhasDaAgenda(prazos: readonly PrazoDoRelatorio[]) {
  const colunas: Coluna[] = [
    ...COLUNAS_PRAZO.filter((c) => c.chave !== 'vencimento'),
    { chave: 'memoria', titulo: 'Memória resumida', largura: 3 },
  ];
  const grupos: { titulo: string | null; linhas: Linha[] }[] = [];
  for (const p of prazos) {
    const titulo = p.vencimento === null ? 'Sem data' : dataCivil(p.vencimento);
    const linha = {
      ...linhaDoPrazo(p),
      memoria: [
        p.inicio === null ? null : `Início ${dataCivil(p.inicio)}`,
        p.fundamento,
        p.vencimentoManual ? 'Definida manualmente' : null,
      ]
        .filter((t) => t !== null && t !== '')
        .join(' · '),
    };
    const atual = grupos.at(-1);
    if (atual?.titulo === titulo) atual.linhas.push(linha);
    else grupos.push({ titulo, linhas: [linha] });
  }
  return { colunas, rotuloDoGrupo: 'Vencimento', grupos };
}

/** Ciência e notificações de um prazo, como o controle de ciência imprime (HU34, RF83). */
export interface CienciaDoRelatorio {
  /** "DD/MM/AAAA HH:MM (horário de Brasília)"; `null` sem confirmação. */
  readonly confirmadaEm: string | null;
  readonly canal: string | null;
  readonly enviadas: number;
  readonly entregues: number;
  readonly rejeitadas: number;
}

const CANAIS: Readonly<Record<string, string>> = {
  email: 'Link do e-mail',
  portal: 'Portal',
  app: 'App',
};

/**
 * Controle de ciência (HU34, RF83): por prazo, a situação da ciência, as notificações enviadas,
 * entregues e rejeitadas e a data e o canal da confirmação (os mesmos dados da trilha).
 */
export function linhasDoControleDeCiencia(
  prazos: readonly PrazoDoRelatorio[],
  ciencias: ReadonlyMap<string, CienciaDoRelatorio>,
) {
  const colunas: Coluna[] = [
    { chave: 'vencimento', titulo: 'Vencimento', largura: 1.2 },
    { chave: 'ato', titulo: 'Ato', largura: 2 },
    { chave: 'ciencia', titulo: 'Ciência', largura: 1 },
    { chave: 'confirmadaEm', titulo: 'Confirmada em', largura: 1.8 },
    { chave: 'canal', titulo: 'Canal', largura: 1.1 },
    { chave: 'notificacoes', titulo: 'Notificações (env./entr./rej.)', largura: 1.6 },
  ];
  const linhas = prazos.map((p) => {
    const c = ciencias.get(p.id);
    const base = linhaDoPrazo(p);
    return {
      vencimento: base.vencimento ?? '',
      ato: base.ato ?? '',
      ciencia: base.ciencia ?? '',
      confirmadaEm: c?.confirmadaEm ?? '',
      canal: c?.canal === null || c?.canal === undefined ? '' : (CANAIS[c.canal] ?? c.canal),
      notificacoes:
        c === undefined
          ? '0 / 0 / 0'
          : `${String(c.enviadas)} / ${String(c.entregues)} / ${String(c.rejeitadas)}`,
    };
  });
  return { colunas, rotuloDoGrupo: null, grupos: [{ titulo: null, linhas }] };
}

/** Busca de publicações (RF57): as colunas da tela de busca. */
export function linhasDaBuscaDePublicacoes(
  publicacoes: readonly PublicacaoDoRelatorio[],
  teorCompleto = false,
) {
  const colunas: Coluna[] = [
    { chave: 'publicacao', titulo: 'Publicação', largura: 1.1 },
    { chave: 'processo', titulo: 'Processo', largura: 2 },
    { chave: 'tribunal', titulo: 'Tribunal', largura: 0.9 },
    { chave: 'teor', titulo: 'Teor', largura: 5 },
  ];
  const linhas = publicacoes.map((p) => {
    const partes = p.numeroCnj === null ? undefined : lerNumeroCnj(p.numeroCnj);
    return {
      publicacao: dataCivil(p.dataDisponibilizacao),
      processo: partes === undefined ? (p.numeroCnj ?? '') : formatarNumeroCnj(partes),
      tribunal: p.siglaTribunal ?? '',
      teor: !teorCompleto && p.teor.length > TRECHO ? `${p.teor.slice(0, TRECHO)}…` : p.teor,
    };
  });
  return { colunas, rotuloDoGrupo: null, grupos: [{ titulo: null, linhas }] };
}

export const TITULOS: Readonly<Record<TipoDeRelatorio | 'prazo' | 'publicacao', string>> = {
  agenda: 'Agenda de prazos',
  'busca-prazos': 'Busca de prazos',
  'busca-publicacoes': 'Busca de publicações',
  'controle-ciencia': 'Controle de ciência',
  // Envio manual (HU32): um prazo ou uma publicação.
  prazo: 'Prazo',
  publicacao: 'Publicação',
};

const ROTULOS_DOS_FILTROS: Readonly<Record<string, string>> = {
  numeroCnj: 'Número CNJ',
  partes: 'Partes',
  clienteId: 'Cliente',
  tribunal: 'Tribunal',
  orgao: 'Órgão',
  comarca: 'Comarca',
  tiposAto: 'Tipos de ato',
  statusPrazo: 'Situação',
  statusCiencia: 'Ciência',
  responsavelId: 'Advogado',
  oab: 'OAB',
  ramo: 'Ramo',
  palavraChave: 'Palavra-chave',
  origem: 'Origem',
  ordem: 'Ordem',
  de: 'De',
  ate: 'Até',
  atalho: 'Período',
  campoData: 'Data alvo',
};

function paraTexto(valor: unknown): string {
  return typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean'
    ? String(valor)
    : JSON.stringify(valor);
}

/**
 * Filtro impresso no cabeçalho (RF61): rótulo e valor de cada campo informado, na ordem do
 * pedido. Ids (cliente, advogado) saem como estão; nomes pedem a consulta aos módulos (F2).
 */
export function descreverFiltros(filtros: Readonly<Record<string, unknown>>): [string, string][] {
  const linhas: [string, string][] = [];
  const somar = (campo: string, valor: unknown) => {
    if (valor === undefined || valor === null || valor === '') return;
    if (typeof valor === 'object' && !Array.isArray(valor)) {
      for (const [c, v] of Object.entries(valor)) somar(c, v);
      return;
    }
    const texto = Array.isArray(valor) ? valor.map(paraTexto).join(', ') : paraTexto(valor);
    const data = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
    linhas.push([ROTULOS_DOS_FILTROS[campo] ?? campo, data ? dataCivil(texto) : texto]);
  };
  for (const [campo, valor] of Object.entries(filtros)) {
    if (campo === 'cursor' || campo === 'limite') continue;
    somar(campo, valor);
  }
  return linhas;
}
