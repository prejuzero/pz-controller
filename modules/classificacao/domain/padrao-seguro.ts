/**
 * Validação dos padrões das regras rápidas contra ReDoS (PZ-316). O motor de expressões do V8
 * usa retrocesso: grupo repetido que contém repetição ou alternativas sobrepostas (`(a+)+`,
 * `(a|a)*`) leva tempo exponencial e trava o worker de classificação com um teor adversário.
 *
 * Em vez de tentar detectar todo padrão vulnerável, aceitamos só um subconjunto seguro, que
 * basta para regras de palavra-chave: repetição apenas sobre um átomo (caractere, escape,
 * classe ou `.`), grupo só opcional (`?`, `{0,1}`, `{1}`), sem retrovisor nem lookaround e com
 * tamanho limitado. Assim a altura de estrela é no máximo 1 e não há retrocesso exponencial.
 *
 * Repetições ilimitadas em sequência ainda dão retrocesso polinomial (`a.*b.*c` leva segundos
 * em poucos milhares de caracteres, PZ-321). Por isso toda repetição tem limite (`{m,n}`, `?`)
 * e o produto das escolhas de todas elas (n + 1 por quantificador) cabe num orçamento fixo: o
 * trabalho por posição inicial fica constante e a busca, linear no tamanho do teor.
 */

export const TAMANHO_MAXIMO_DO_PADRAO = 300;
export const ORCAMENTO_DE_REPETICAO = 1000;

type Anterior = 'nada' | 'atomo' | 'grupo' | 'quantificador';

const QUANTIFICADOR_CHAVES = /^\{(\d+)(,(\d*))?\}/;

/** Máximo de repetições do quantificador (`Infinity` para `*`, `+` e `{n,}`). */
function maximoDe(quantificador: string): number {
  const chaves = QUANTIFICADOR_CHAVES.exec(quantificador);
  if (chaves === null) return quantificador === '?' ? 1 : Infinity;
  const minimo = Number(chaves[1]);
  return chaves[2] === undefined ? minimo : chaves[3] === '' ? Infinity : Number(chaves[3]);
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
  let escolhas = 1;
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
        const maximo = maximoDe(quantificador);
        if (anterior === 'grupo' && maximo > 1) {
          return 'repetição de grupo (ex.: (a+)+, (a|b)*) não é permitida: repita só um caractere ou classe';
        }
        if (maximo === Infinity) {
          return 'repetição ilimitada (*, +, {n,}) não é permitida: use um limite, ex.: \\s{1,5}';
        }
        escolhas *= maximo + 1;
        if (escolhas > ORCAMENTO_DE_REPETICAO) {
          return `repetições demais: o produto dos limites passa de ${String(ORCAMENTO_DE_REPETICAO)}`;
        }
        i += quantificador.length;
        anterior = 'quantificador';
      }
    }
  }
  return undefined;
}
