/**
 * Número CNJ e tribunais para o portal (HU12): a mesma função pura do domínio, pelo subcaminho
 * sem dependências de servidor do kernel.
 */
export { formatarNumeroCnj, lerNumeroCnj, TRIBUNAIS, tribunalDoNumero } from '@pz/kernel/cnj';
export type { PartesDoNumeroCnj, Tribunal } from '@pz/kernel/cnj';
