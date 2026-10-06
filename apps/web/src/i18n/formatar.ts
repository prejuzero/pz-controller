import { formatos, FUSO_PADRAO, IDIOMA_PADRAO } from './configuracao';

const DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Data jurídica (`DataCivil`, AAAA-MM-DD) como DD/MM/AAAA. Sem conversão de fuso: a data civil
 * não é um instante, e convertê-la poderia exibir o dia anterior (ADR-013).
 */
export function formatarDataCivil(valor: string): string {
  const partes = DATA_CIVIL.exec(valor);
  if (partes === null) throw new RangeError(`Data civil inválida: ${valor}`);
  return `${partes[3] ?? ''}/${partes[2] ?? ''}/${partes[1] ?? ''}`;
}

/** Instante (ISO 8601 com fuso, vindo do servidor) no fuso de exibição. */
export function formatarInstante(valor: string, fuso: string = FUSO_PADRAO): string {
  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) throw new RangeError(`Instante inválido: ${valor}`);
  return new Intl.DateTimeFormat(IDIOMA_PADRAO, {
    ...formatos.dateTime.dataHora,
    timeZone: fuso,
  }).format(instante);
}
