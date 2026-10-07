import type { Instant, LocalDate, Uuid } from '@pz/kernel';

export const TIPOS_DE_ALVO = ['oab', 'processo'] as const;
export type TipoDeAlvo = (typeof TIPOS_DE_ALVO)[number];

export interface JanelaDaCaptura {
  readonly inicio: LocalDate;
  readonly fim: LocalDate;
}

/** Valor canônico de uma OAB no alvo: "número/UF", como a mesma OAB chega de qualquer tenant. */
export function valorDaOab(numero: string, uf: string): string {
  const valor = `${numero.trim()}/${uf.trim().toUpperCase()}`;
  if (!/^\d{1,8}\/[A-Z]{2}$/.test(valor)) throw new RangeError(`OAB inválida: "${valor}"`);
  return valor;
}

/** Valor canônico de um processo no alvo: os 20 dígitos do número CNJ. */
export function valorDoProcesso(numeroCnj: string): string {
  const digitos = numeroCnj.replace(/\D/g, '');
  if (digitos.length !== 20) throw new RangeError('Número CNJ deve ter 20 dígitos.');
  return digitos;
}

/**
 * Janela de busca (HU17): do dia anterior ao fim da última captura com sucesso até hoje. O dia de
 * sobreposição cobre publicações disponibilizadas depois da consulta anterior; a deduplicação
 * por id externo e hash torna a repetição inofensiva. Alvo novo: os `diasIniciais` até hoje.
 */
export function janelaDaCaptura(
  ultimaJanelaFim: LocalDate | undefined,
  hoje: LocalDate,
  diasIniciais: number,
): JanelaDaCaptura {
  const inicio =
    ultimaJanelaFim === undefined ? hoje.maisDias(-diasIniciais) : ultimaJanelaFim.maisDias(-1);
  return { inicio: inicio.ehDepoisDe(hoje) ? hoje : inicio, fim: hoje };
}

/** Chave de idempotência da execução: o mesmo alvo e a mesma janela entregam uma vez só. */
export function chaveDaCaptura(alvoId: Uuid | string, janela: JanelaDaCaptura): string {
  return `${alvoId}:${janela.inicio.paraIso()}:${janela.fim.paraIso()}`;
}

const MEIA_HORA_MS = 30 * 60_000;
const SEIS_HORAS_MS = 6 * 3_600_000;

/** Depois de `falhas` seguidas, a próxima tentativa: 30 min dobrando até 6 h. */
export function proximaTentativa(agora: Instant, falhas: number): Instant {
  return agora.maisMs(Math.min(MEIA_HORA_MS * 2 ** Math.max(0, falhas - 1), SEIS_HORAS_MS));
}
