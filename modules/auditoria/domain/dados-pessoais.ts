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
