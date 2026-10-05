/**
 * Redação de dados sensíveis antes de qualquer saída de observabilidade (logs, erros, spans).
 * CLAUDE.md, seção 3: nunca registrar CPF, senha, token, segredo, cookie ou teor sigiloso.
 * Na dúvida, remove: perder um detalhe de log é melhor que vazar dado pessoal (LGPD).
 */

export const MARCADOR_REMOVIDO = '[REMOVIDO]';

const PROFUNDIDADE_MAXIMA = 10;

/** Partes de nome de chave que indicam conteúdo sensível (comparadas por palavra, não por trecho). */
const PARTES_SENSIVEIS = new Set([
  'cpf',
  'senha',
  'senhas',
  'password',
  'passwd',
  'pwd',
  'token',
  'tokens',
  'segredo',
  'segredos',
  'secret',
  'secrets',
  'authorization',
  'cookie',
  'cookies',
  'otp',
  'totp',
  'credencial',
  'credenciais',
  'credential',
  'credentials',
]);

// Lookarounds em vez de \b: um CPF colado a letras ("cpf=123...") também é removido, mas uma
// sequência maior de dígitos (número CNJ, 20 dígitos) não é confundida com CPF.
const PADROES_SENSIVEIS: readonly RegExp[] = [
  /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g,
  /(?<!\d)\d{11}(?!\d)/g,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g,
];
const PADRAO_BEARER = /(Bearer\s+)[\w\-.~+/]+=*/gi;

function partesDaChave(chave: string): string[] {
  return chave
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((parte) => parte.length > 0);
}

export function chaveSensivel(chave: string): boolean {
  const partes = partesDaChave(chave);
  return partes.some((parte) => PARTES_SENSIVEIS.has(parte)) || partes.join('').includes('apikey');
}

export function sanitizarTexto(texto: string): string {
  let resultado = texto.replace(PADRAO_BEARER, `$1${MARCADOR_REMOVIDO}`);
  for (const padrao of PADROES_SENSIVEIS) {
    resultado = resultado.replace(padrao, MARCADOR_REMOVIDO);
  }
  return resultado;
}

function binario(valor: object): boolean {
  return ArrayBuffer.isView(valor) || valor instanceof ArrayBuffer;
}

function erroComoObjeto(erro: Error): Record<string, unknown> {
  const { name, message, stack, cause, ...demais } = erro as Error & Record<string, unknown>;
  return {
    type: name,
    message,
    ...(stack === undefined ? {} : { stack }),
    ...(cause === undefined ? {} : { cause }),
    ...demais,
  };
}

function sanitizarValor(valor: unknown, profundidade: number, vistos: WeakSet<object>): unknown {
  if (typeof valor === 'string') return sanitizarTexto(valor);
  if (valor === null || typeof valor !== 'object') return valor;
  if (valor instanceof Date) return valor;
  if (binario(valor)) return '[BINARIO]';
  if (vistos.has(valor)) return '[CIRCULAR]';
  if (profundidade >= PROFUNDIDADE_MAXIMA) return '[PROFUNDIDADE MAXIMA]';

  vistos.add(valor);
  try {
    if (Array.isArray(valor)) {
      return valor.map((item: unknown) => sanitizarValor(item, profundidade + 1, vistos));
    }
    const origem = valor instanceof Error ? erroComoObjeto(valor) : valor;
    // fromEntries cria propriedades próprias: uma chave "__proto__" não altera o protótipo.
    return Object.fromEntries(
      Object.entries(origem).map(([chave, item]) => [
        chave,
        chaveSensivel(chave) ? MARCADOR_REMOVIDO : sanitizarValor(item, profundidade + 1, vistos),
      ]),
    );
  } finally {
    vistos.delete(valor);
  }
}

/** Devolve uma cópia sem dados sensíveis. Não altera o valor original. */
export function sanitizar(valor: unknown): unknown {
  return sanitizarValor(valor, 0, new WeakSet());
}
