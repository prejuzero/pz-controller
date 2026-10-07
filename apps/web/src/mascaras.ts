/**
 * Máscaras de digitação (HU11). Só formatam o que a pessoa digita; quem valida é a API
 * (dígitos verificadores do CPF, DDD e nono dígito do celular).
 */
const digitos = (texto: string, maximo: number) => texto.replace(/\D/g, '').slice(0, maximo);

/** 000.000.000-00, preenchido conforme a digitação. */
export function mascararCpf(texto: string): string {
  const d = digitos(texto, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/** (00) 00000-0000, preenchido conforme a digitação. */
export function mascararCelular(texto: string): string {
  const d = digitos(texto, 11);
  if (d.length <= 2) return d.length === 0 ? '' : `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
