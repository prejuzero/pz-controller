/**
 * Resumo da publicação por IA (HU62; decisões do usuário em 06/11/2026: só portal e API, meta
 * provisória de 98%). Gerado uma vez por conteúdo (ADR-014). A IA interpreta; o código confere que
 * cada trecho de evidência é cópia literal do teor, para que nada inventado apareça como citação.
 */

/** Trecho menor que isto não comprova nada (ex.: "dias"). */
const MINIMO_DO_TRECHO = 12;

const comoComparar = (texto: string) => texto.replace(/\s+/g, ' ').trim();

/** O trecho está no teor, palavra por palavra (só espaços e quebras de linha podem variar). */
export function trechoLiteral(teor: string, trecho: string): boolean {
  const procurado = comoComparar(trecho);
  return procurado.length >= MINIMO_DO_TRECHO && comoComparar(teor).includes(procurado);
}

/** O que a IA respondeu, já validado pelo schema (ou o motivo de não ter resposta). */
export type RespostaDoResumo =
  | {
      readonly tipo: 'ok';
      readonly resumo: string;
      readonly providencia: string | null;
      readonly trechos: readonly string[];
      readonly modelo: string;
      readonly versaoPrompt: string;
    }
  | { readonly tipo: 'invalida' }
  | { readonly tipo: 'sem-orcamento' };

export interface Resumo {
  /** `revisao_manual`: não é exibido; fica para a curadoria olhar. */
  readonly situacao: 'ok' | 'revisao_manual';
  readonly texto: string | null;
  readonly providencia: string | null;
  readonly trechos: readonly string[];
  readonly modelo: string | null;
  readonly versaoPrompt: string | null;
  readonly motivo: 'trecho-fora-do-teor' | 'saida-invalida' | null;
}

const emRevisao = (motivo: NonNullable<Resumo['motivo']>, r?: RespostaDoResumo): Resumo => ({
  situacao: 'revisao_manual',
  texto: null,
  providencia: null,
  trechos: [],
  modelo: r?.tipo === 'ok' ? r.modelo : null,
  versaoPrompt: r?.tipo === 'ok' ? r.versaoPrompt : null,
  motivo,
});

/** Sem orçamento não grava nada: o conteúdo pode ser resumido depois. */
export function decidirResumo(teor: string, resposta: RespostaDoResumo): Resumo | undefined {
  if (resposta.tipo === 'sem-orcamento') return undefined;
  if (resposta.tipo === 'invalida') return emRevisao('saida-invalida');
  if (!resposta.trechos.every((t) => trechoLiteral(teor, t))) {
    return emRevisao('trecho-fora-do-teor', resposta);
  }
  return {
    situacao: 'ok',
    texto: resposta.resumo,
    providencia: resposta.providencia,
    trechos: [...resposta.trechos],
    modelo: resposta.modelo,
    versaoPrompt: resposta.versaoPrompt,
    motivo: null,
  };
}
