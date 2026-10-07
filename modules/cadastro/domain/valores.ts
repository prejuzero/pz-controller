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

/**
 * CNPJ com os dois dígitos verificadores (módulo 11, pesos 2 a 9 da direita para a esquerda).
 * Aceita o formato alfanumérico da IN RFB nº 2.229/2024: as 12 primeiras posições podem ter
 * letras, que valem o código ASCII menos 48 no cálculo; os verificadores são sempre dígitos.
 */
function cnpjConfere(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const valores = Array.from(cnpj, (c) => c.charCodeAt(0) - 48);
  const dv = (quantos: number) => {
    const soma = valores
      .slice(0, quantos)
      .reduce((total, v, i) => total + v * (((quantos - 1 - i) % 8) + 2), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === valores[12] && dv(13) === valores[13];
}

/** Documento do cliente: CPF (pessoa física) ou CNPJ (pessoa jurídica), sem pontuação. */
export class Documento {
  private constructor(
    readonly valor: string,
    readonly tipo: 'cpf' | 'cnpj',
  ) {}

  static de(texto: string, campo = 'documento'): Result<Documento, Validacao> {
    const limpo = texto.toUpperCase().replace(/[.\-/\s]/g, '');
    if (/^\d{11}$/.test(limpo)) {
      const cpf = Cpf.de(limpo, campo);
      return cpf.ok ? ok(new Documento(cpf.valor.valor, 'cpf')) : cpf;
    }
    return cnpjConfere(limpo)
      ? ok(new Documento(limpo, 'cnpj'))
      : invalido(campo, 'CPF ou CNPJ inválido.');
  }
}

/** Para a auditoria: CPF só com os dígitos do meio; CNPJ é dado de pessoa jurídica e fica inteiro. */
export function mascararDocumento(documento: string): string {
  return documento.length === 11 ? mascararCpf(documento) : documento;
}
