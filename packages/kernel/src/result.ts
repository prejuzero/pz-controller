/**
 * Resultado de uma operação que pode falhar de forma esperada (CLAUDE.md, seção 8): erros de
 * negócio voltam como valor; exceções ficam para falhas inesperadas.
 */
export interface Ok<Valor> {
  readonly ok: true;
  readonly valor: Valor;
}

export interface Err<Erro> {
  readonly ok: false;
  readonly erro: Erro;
}

export type Result<Valor, Erro> = Ok<Valor> | Err<Erro>;

export function ok<Valor>(valor: Valor): Ok<Valor> {
  return Object.freeze({ ok: true, valor });
}

export function err<Erro>(erro: Erro): Err<Erro> {
  return Object.freeze({ ok: false, erro });
}
