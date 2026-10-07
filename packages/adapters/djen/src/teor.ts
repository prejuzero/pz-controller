import { createHash } from 'node:crypto';

// Entidades nomeadas comuns em textos jurídicos em português (HTML 4, Latin-1); as numéricas
// (&#233;, &#xE9;) são decodificadas à parte. Desconhecida fica como veio.
const ENTIDADES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ordm: 'º',
  ordf: 'ª',
  sect: '§',
  deg: '°',
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  Aacute: 'Á',
  Agrave: 'À',
  Acirc: 'Â',
  Atilde: 'Ã',
  Auml: 'Ä',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  Eacute: 'É',
  Egrave: 'È',
  Ecirc: 'Ê',
  Euml: 'Ë',
  iacute: 'í',
  igrave: 'ì',
  icirc: 'î',
  iuml: 'ï',
  Iacute: 'Í',
  Igrave: 'Ì',
  Icirc: 'Î',
  Iuml: 'Ï',
  oacute: 'ó',
  ograve: 'ò',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  Oacute: 'Ó',
  Ograve: 'Ò',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  uacute: 'ú',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  Uacute: 'Ú',
  Ugrave: 'Ù',
  Ucirc: 'Û',
  Uuml: 'Ü',
  ccedil: 'ç',
  Ccedil: 'Ç',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
};
// Tags que encerram um bloco viram quebra de linha; as demais somem.
const BLOCO = /<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi;
const TAG = /<[^>]*>/g;

function decodificar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteira, nome: string) => {
    if (nome.startsWith('#x') || nome.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(nome.slice(2), 16));
    }
    if (nome.startsWith('#')) return String.fromCodePoint(Number.parseInt(nome.slice(1), 10));
    return ENTIDADES[nome] ?? ENTIDADES[nome.toLowerCase()] ?? inteira;
  });
}

/**
 * Teor normalizado (HU17): sem HTML, entidades decodificadas, espaços colapsados e linhas vazias
 * removidas. A mesma publicação vinda com formatação diferente gera o mesmo hash (ADR-014).
 */
export function normalizarTeor(bruto: string): string {
  const semTags = bruto.replace(/\r\n?/g, '\n').replace(BLOCO, '\n').replace(TAG, '');
  return decodificar(semTags)
    .normalize('NFC')
    .split('\n')
    .map((linha) => linha.replace(/\s+/g, ' ').trim())
    .filter((linha) => linha !== '')
    .join('\n');
}

/** SHA-256 (hex) do teor já normalizado: chave de deduplicação do conteúdo. */
export function hashDoTeor(teorNormalizado: string): string {
  return createHash('sha256').update(teorNormalizado, 'utf8').digest('hex');
}
