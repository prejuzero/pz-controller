/** Escopos da exportação (HU38, LGPD): o titular (dados pessoais) ou o escritório (tenant). */
export const ESCOPOS_DE_EXPORTACAO = ['titular', 'escritorio'] as const;
export type EscopoDeExportacao = (typeof ESCOPOS_DE_EXPORTACAO)[number];

export type ValorExportado =
  string | number | boolean | null | readonly string[] | readonly number[];

/** Uma seção do arquivo (ex.: `conta`, `oabs`, `processos`), com linhas planas. */
export interface SecaoExportada {
  readonly nome: string;
  readonly linhas: readonly Readonly<Record<string, ValorExportado>>[];
}

export function paraJson(
  secoes: readonly SecaoExportada[],
  meta: { readonly escopo: EscopoDeExportacao; readonly geradoEm: string },
): string {
  return JSON.stringify(
    { ...meta, secoes: Object.fromEntries(secoes.map((s) => [s.nome, s.linhas])) },
    null,
    2,
  );
}

function celula(valor: ValorExportado | undefined): string {
  if (valor === undefined || valor === null) return '';
  const texto = Array.isArray(valor) ? valor.join(';') : String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/**
 * CSV legível em planilha: cada seção começa com `# nome`, depois o cabeçalho (união das
 * colunas das linhas) e as linhas; seções separadas por linha vazia (RFC 4180, CRLF).
 */
export function paraCsv(secoes: readonly SecaoExportada[]): string {
  const blocos = secoes.map(({ nome, linhas }) => {
    const colunas = [...new Set(linhas.flatMap((linha) => Object.keys(linha)))];
    const corpo = linhas.map((linha) => colunas.map((c) => celula(linha[c])).join(','));
    return [`# ${nome}`, ...(colunas.length === 0 ? [] : [colunas.join(',')]), ...corpo, ''].join(
      '\r\n',
    );
  });
  return `${blocos.join('\r\n')}\r\n`;
}
