/**
 * Catálogo das filas (HU10). Cada grupo pode rodar num serviço próprio (WORKER_QUEUES) e
 * escalar pela profundidade. Retentativa exponencial: atraso = atrasoBaseMs × 2^(tentativa-1).
 */
export const FILAS = {
  eventos: { tentativas: 8, atrasoBaseMs: 1_000, concorrencia: 20 },
  captura: { tentativas: 5, atrasoBaseMs: 30_000, concorrencia: 5 },
  ingestao: { tentativas: 5, atrasoBaseMs: 5_000, concorrencia: 10 },
  classificacao: { tentativas: 5, atrasoBaseMs: 10_000, concorrencia: 5 },
  prazos: { tentativas: 5, atrasoBaseMs: 2_000, concorrencia: 10 },
  notificacoes: { tentativas: 6, atrasoBaseMs: 10_000, concorrencia: 10 },
  relatorios: { tentativas: 3, atrasoBaseMs: 30_000, concorrencia: 2 },
  integracoes: { tentativas: 6, atrasoBaseMs: 10_000, concorrencia: 5 },
  manutencao: { tentativas: 3, atrasoBaseMs: 60_000, concorrencia: 1 },
} as const;

export type NomeFila = keyof typeof FILAS;
export const NOMES_FILAS = Object.keys(FILAS) as NomeFila[];

/** Fila de mensagens mortas de cada fila: jobs que esgotaram as tentativas ou são inválidos. */
export function filaDlq(fila: NomeFila): string {
  return `${fila}-dlq`;
}
