import { err, ok, Validacao } from '@pz/kernel';

import type { Result } from '@pz/kernel';

const invalido = (campo: string, mensagem: string) => err(new Validacao([{ campo, mensagem }]));
const digitos = (texto: string) => texto.replace(/\D/g, '');

/** CPF: 11 dígitos com os dois dígitos verificadores (algoritmo da Receita Federal). */
export class Cpf {
  private constructor(readonly valor: string) {}

  static de(texto: string, campo = 'cpf'): Result<Cpf, Validacao> {
    const numero = digitos(texto);
    if (numero.length !== 11 || /^(\d)\1{10}$/.test(numero) || !digitosConferem(numero))
      return invalido(campo, 'CPF inválido.');
    return ok(new Cpf(numero));
  }

  mascarado(): string {
    return mascararCpf(this.valor);
  }
}

/** Para telas e auditoria: só os dígitos do meio (LGPD, minimização). */
export function mascararCpf(digitosDoCpf: string): string {
  return `***.${digitosDoCpf.slice(3, 6)}.${digitosDoCpf.slice(6, 9)}-**`;
}

function digitosConferem(numero: string): boolean {
  const n = Array.from(numero, Number);
  const dv = (quantos: number) => {
    const soma = n.slice(0, quantos).reduce((total, d, i) => total + d * (quantos + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === n[9] && dv(10) === n[10];
}

/** As 27 unidades da federação; a OAB tem uma seccional por UF. */
export const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;
export type Uf = (typeof UFS)[number];

export function lerUf(texto: string, campo = 'uf'): Result<Uf, Validacao> {
  const uf = texto.trim().toUpperCase();
  return (UFS as readonly string[]).includes(uf) ? ok(uf as Uf) : invalido(campo, 'UF inválida.');
}

/**
 * Número de inscrição na OAB: até 6 dígitos, com letra opcional da seccional (ex.: "123456",
 * "12345A"). Zeros à esquerda, pontos e traços são ignorados para comparar inscrições.
 */
export class NumeroOab {
  private constructor(readonly valor: string) {}

  static de(texto: string, campo = 'numero'): Result<NumeroOab, Validacao> {
    const limpo = texto
      .trim()
      .toUpperCase()
      .replace(/[.\-\s]/g, '')
      .replace(/^0+(?=\d)/, '');
    if (!/^\d{1,6}[A-Z]?$/.test(limpo)) return invalido(campo, 'Número da OAB inválido.');
    return ok(new NumeroOab(limpo));
  }
}

/** Celular brasileiro: DDD válido (11–99) + 9 + 8 dígitos; guardado só com dígitos. */
export class Celular {
  private constructor(readonly valor: string) {}

  static de(texto: string, campo = 'celular'): Result<Celular, Validacao> {
    const numero = digitos(texto).replace(/^55(?=\d{11}$)/, '');
    if (!/^[1-9][1-9]9\d{8}$/.test(numero)) return invalido(campo, 'Celular inválido.');
    return ok(new Celular(numero));
  }
}
