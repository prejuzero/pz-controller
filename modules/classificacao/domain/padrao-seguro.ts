/**
 * Validação dos padrões das regras rápidas contra ReDoS (PZ-316). O motor de expressões do V8
 * usa retrocesso: grupo repetido que contém repetição ou alternativas sobrepostas (`(a+)+`,
 * `(a|a)*`) leva tempo exponencial e trava o worker de classificação com um teor adversário.
 *
 * Em vez de tentar detectar todo padrão vulnerável, aceitamos só um subconjunto seguro, que
 * basta para regras de palavra-chave: repetição apenas sobre um átomo (caractere, escape,
 * classe ou `.`), grupo só opcional (`?`, `{0,1}`, `{1}`), sem retrovisor nem lookaround e com
 * tamanho limitado. Assim a altura de estrela é no máximo 1 e não há retrocesso exponencial.
 */

export const TAMANHO_MAXIMO_DO_PADRAO = 300;

type Anterior = 'nada' | 'atomo' | 'grupo' | 'quantificador';

const QUANTIFICADOR_CHAVES = /^\{(\d+)(,(\d*))?\}/;

/** Grupo quantificado por `?`, `{0,1}` ou `{n}` com n ≤ 1 não repete. */
function soOpcional(quantificador: string): boolean {
  const chaves = QUANTIFICADOR_CHAVES.exec(quantificador);
  if (chaves === null) return quantificador === '?';
  const minimo = Number(chaves[1]);
  const maximo = chaves[2] === undefined ? minimo : chaves[3] === '' ? Infinity : Number(chaves[3]);
  return maximo <= 1;
}

/** Fim da classe `[...]` que começa em `inicio` (índice logo após o `]`). */
function fimDaClasse(padrao: string, inicio: number): number {
  let i = inicio + 1;
  if (padrao[i] === '^') i++;
  if (padrao[i] === ']') i++;
  while (i < padrao.length && padrao[i] !== ']') i += padrao[i] === '\\' ? 2 : 1;
  return i + 1;
}

/** Motivo da recusa do padrão, ou `undefined` se ele é seguro para uso. */
export function motivoDaRecusa(padrao: string): string | undefined {
  if (padrao.length > TAMANHO_MAXIMO_DO_PADRAO) {
    return `padrão acima do tamanho máximo de ${String(TAMANHO_MAXIMO_DO_PADRAO)} caracteres`;
  }
  try {
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- só compila para checar a sintaxe; não executa contra texto
    new RegExp(padrao, 'g');
  } catch {
    // Expressão mal formada: o chamador recusa a regra com este motivo (não é falha silenciosa).
    return 'expressão regular mal formada';
  }
  let anterior: Anterior = 'nada';
  let i = 0;
  while (i < padrao.length) {
    const c = padrao[i];
    const resto = padrao.slice(i);
    if (c === '\\') {
      if (/^\\(?:[1-9]|k<)/.test(resto)) return 'retrovisor (\\1, \\k<nome>) não é permitido';
      i += 2;
      anterior = 'atomo';
    } else if (c === '[') {
      i = fimDaClasse(padrao, i);
      anterior = 'atomo';
    } else if (c === '(') {
      if (/^\(\?(?:=|!|<=|<!)/.test(resto)) return 'lookaround não é permitido';
      i += resto.startsWith('(?:') ? 3 : 1;
      anterior = 'nada';
    } else if (c === ')') {
      i += 1;
      anterior = 'grupo';
    } else if (c === '|' || c === '^' || c === '$') {
      i += 1;
      anterior = 'nada';
    } else {
      const chaves = c === '{' ? QUANTIFICADOR_CHAVES.exec(resto) : null;
      const quantificador = chaves?.[0] ?? (c === '*' || c === '+' || c === '?' ? c : undefined);
      // `?` depois de um quantificador o torna preguiçoso: não é nova repetição.
      if (quantificador === undefined || (c === '?' && anterior === 'quantificador')) {
        i += 1;
        anterior = quantificador === undefined ? 'atomo' : 'nada';
      } else {
        if (anterior === 'grupo' && !soOpcional(quantificador)) {
          return 'repetição de grupo (ex.: (a+)+, (a|b)*) não é permitida: repita só um caractere ou classe';
        }
        i += quantificador.length;
        anterior = 'quantificador';
      }
    }
  }
  return undefined;
}
