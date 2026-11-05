/** Chave do marcador de dado pessoal em `antes`/`depois` (ADR-018). */
export const MARCADOR_DADO_PESSOAL = '$dadoPessoal';

export interface DadoPessoalMarcado {
  readonly [MARCADOR_DADO_PESSOAL]: string;
}

/**
 * Marca um valor pessoal (nome, e-mail, CPF...) para ficar fora do hash da trilha: a trilha
 * guarda só a referência, e o valor pode ser pseudonimizado na LGPD sem quebrar a cadeia.
 */
export function dadoPessoal(valor: string): DadoPessoalMarcado {
  return { [MARCADOR_DADO_PESSOAL]: valor };
}

function ehMarcador(valor: unknown): valor is DadoPessoalMarcado {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor) &&
    Object.keys(valor).length === 1 &&
    typeof (valor as Record<string, unknown>)[MARCADOR_DADO_PESSOAL] === 'string'
  );
}

/** Troca, em qualquer profundidade, o valor de cada marcador pelo que `trocar` devolver. */
export function substituirDadosPessoais(
  valor: unknown,
  trocar: (valor: string) => string,
): unknown {
  if (ehMarcador(valor)) return dadoPessoal(trocar(valor[MARCADOR_DADO_PESSOAL]));
  if (Array.isArray(valor)) return valor.map((item) => substituirDadosPessoais(item, trocar));
  if (typeof valor === 'object' && valor !== null) {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, item]) => [chave, substituirDadosPessoais(item, trocar)]),
    );
  }
  return valor;
}

/** Chaves que sempre guardam dado pessoal, em qualquer entidade. */
const CHAVES_PESSOAIS = new Set(['email', 'cpf', 'cnpj', 'documento', 'telefone', 'celular']);
/** Entidades de pessoa: nelas, `nome` é o nome de alguém (no tipo de ato, não é). */
const ENTIDADES_DE_PESSOA = new Set(['usuario', 'advogado', 'cliente', 'tenant']);
/** E-mail em qualquer ponto do texto; CPF e CNPJ isolados, com ou sem máscara. */
const PADROES_PESSOAIS = [
  /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
  /(?:^|\D)(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?:\D|$)/,
  /(?:^|\D)(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})(?:\D|$)/,
];

const ehChavePessoal = (chave: string, entidade: string) =>
  CHAVES_PESSOAIS.has(chave) || (chave === 'nome' && ENTIDADES_DE_PESSOA.has(entidade));

/**
 * Rede de proteção da trilha (ADR-018, PZ-305): marca o que tem cara de dado pessoal mesmo sem
 * `dadoPessoal(...)` no emissor. Texto com e-mail, CPF ou CNPJ e as chaves pessoais saem do hash;
 * o que já está marcado fica como está (idempotente). Na dúvida, marca: um campo a mais fora do
 * hash só deixa de ser verificável, um dado pessoal no hash não pode mais ser pseudonimizado.
 */
export function marcarDadosPessoais(valor: unknown, entidade: string, chave = ''): unknown {
  if (ehMarcador(valor)) return valor;
  if (typeof valor === 'string')
    return ehChavePessoal(chave, entidade) || PADROES_PESSOAIS.some((p) => p.test(valor))
      ? dadoPessoal(valor)
      : valor;
  if (Array.isArray(valor)) return valor.map((item) => marcarDadosPessoais(item, entidade, chave));
  if (typeof valor === 'object' && valor !== null) {
    return Object.fromEntries(
      Object.entries(valor).map(([c, item]) => [c, marcarDadosPessoais(item, entidade, c)]),
    );
  }
  return valor;
}
