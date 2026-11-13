import { nomeMonitoradoCanonico, TAMANHO_DO_NOME_MONITORADO } from '@pz/kernel';

import type { Instant, LocalDate, Uuid } from '@pz/kernel';

export const TIPOS_DE_ALVO = ['oab', 'processo', 'nome'] as const;
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

/** Valor canônico de um nome monitorado (HU42), a mesma forma que o cadastro grava. */
export function valorDoNome(nome: string): string {
  const valor = nomeMonitoradoCanonico(nome);
  if (valor === undefined) {
    const { minimo, maximo } = TAMANHO_DO_NOME_MONITORADO;
    throw new RangeError(`Nome deve ter de ${String(minimo)} a ${String(maximo)} caracteres.`);
  }
  return valor;
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

/**
 * Chave de idempotência da execução: o mesmo alvo, a mesma janela e a mesma rodada entregam uma
 * vez só (a retentativa do job não duplica). Com a rodada, a segunda busca do dia com a mesma
 * janela também entrega; a deduplicação da ingestão torna a repetição inofensiva. Sem rodada,
 * a chave dos jobs enfileirados antes dela.
 */
export function chaveDaCaptura(
  alvoId: Uuid | string,
  janela: JanelaDaCaptura,
  rodada?: string,
): string {
  const base = `${alvoId}:${janela.inicio.paraIso()}:${janela.fim.paraIso()}`;
  return rodada === undefined ? base : `${base}:${rodada}`;
}

/** Intervalo mínimo entre dois pedidos de "buscar agora" do mesmo alvo (não sobrecarregar a fonte). */
export const INTERVALO_DA_BUSCA_AGORA_MS = 5 * 60_000;

/** Quando a próxima busca manual do alvo é aceita; sem pedido anterior, já. */
export function buscaAgoraLiberadaEm(ultimoPedido: Instant | undefined): Instant | undefined {
  return ultimoPedido?.maisMs(INTERVALO_DA_BUSCA_AGORA_MS);
}

const MEIA_HORA_MS = 30 * 60_000;
const SEIS_HORAS_MS = 6 * 3_600_000;

/** Depois de `falhas` seguidas, a próxima tentativa: 30 min dobrando até 6 h. */
export function proximaTentativa(agora: Instant, falhas: number): Instant {
  return agora.maisMs(Math.min(MEIA_HORA_MS * 2 ** Math.max(0, falhas - 1), SEIS_HORAS_MS));
}
