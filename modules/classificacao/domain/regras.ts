import { motivoDaRecusa } from './padrao-seguro.js';
import { extrairPrazosCitados, type PrazoCitado } from './prazo-citado.js';
import { evidencia, normalizar, type Evidencia } from './texto.js';

/**
 * Regra rápida (HU20): dado versionado, mantido pela curadoria. Os padrões são expressões
 * regulares sobre o texto **minúsculo e sem acento**; basta um casar. A regra aponta um tipo de
 * ato da taxonomia (HU15) e diz a confiança. Nenhuma regra decide data (ADR-008).
 */
export interface RegraRapida {
  readonly codigo: string;
  readonly versao: number;
  readonly tipoAto: string;
  readonly padroes: readonly string[];
  /** De 0 a 1. Abaixo de 0,85 o resultado fica "a confirmar" (CLAUDE.md, seção 11). */
  readonly confianca: number;
}

export type ResultadoDasRegras =
  | {
      readonly situacao: 'classificada';
      readonly tipoAto: string;
      readonly regra: { readonly codigo: string; readonly versao: number };
      readonly confianca: number;
      readonly evidencias: readonly Evidencia[];
      readonly prazoCitado?: PrazoCitado;
    }
  | { readonly situacao: 'nenhuma'; readonly prazoCitado?: PrazoCitado };

/**
 * Padrão inválido ou sujeito a ReDoS é erro de cadastro: recusa antes de a regra entrar em uso
 * (PZ-316, ver padrao-seguro.ts).
 */
export function padraoValido(padrao: string): boolean {
  return motivoDaRecusa(padrao) === undefined;
}

function evidenciasDa(regra: RegraRapida, teor: string, texto: string): Evidencia[] {
  return regra.padroes.flatMap((padrao) =>
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- padrão do cadastro do curador, já recusado se mal formado ou sujeito a ReDoS (padraoValido)
    [...texto.matchAll(new RegExp(padrao, 'g'))]
      .filter((m) => m[0].length > 0)
      .map((m) => evidencia(teor, m.index, m.index + m[0].length)),
  );
}

/**
 * Aplica as regras: vence a de maior confiança (empate: menor código, para ser determinístico).
 * O prazo citado vem junto, com a regra ou sem ela.
 */
export function classificarPorRegras(
  teor: string,
  regras: readonly RegraRapida[],
): ResultadoDasRegras {
  const texto = normalizar(teor);
  const [prazoCitado] = extrairPrazosCitados(teor);
  const comPrazo = prazoCitado === undefined ? {} : { prazoCitado };
  const candidatas = regras
    .map((regra) => ({ regra, evidencias: evidenciasDa(regra, teor, texto) }))
    .filter((c) => c.evidencias.length > 0)
    .sort(
      (x, y) =>
        y.regra.confianca - x.regra.confianca ||
        (x.regra.codigo < y.regra.codigo ? -1 : x.regra.codigo > y.regra.codigo ? 1 : 0),
    );
  const [vencedora] = candidatas;
  if (vencedora === undefined) return { situacao: 'nenhuma', ...comPrazo };
  const { regra, evidencias } = vencedora;
  return {
    situacao: 'classificada',
    tipoAto: regra.tipoAto,
    regra: { codigo: regra.codigo, versao: regra.versao },
    confianca: regra.confianca,
    evidencias,
    ...comPrazo,
  };
}
