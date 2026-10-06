import type { Clock } from './clock.js';
import type { EventoDominio } from './entidade.js';
import type { Instant } from './instant.js';
import type { Uuid } from './uuid.js';

/**
 * Portas do outbox transacional (ADR-004). As implementações reais ficam no Postgres
 * (tabelas `evento_dominio` e `evento_processado`, HU05) e no relay do worker (HU10);
 * `OutboxEmMemoria` implementa as mesmas portas para testes.
 */

/** Executa um trabalho numa transação: confirma se terminar, reverte se lançar. */
export interface UnidadeDeTrabalho<Transacao> {
  executar<Resultado>(trabalho: (transacao: Transacao) => Promise<Resultado>): Promise<Resultado>;
}

/** Grava os eventos do agregado na mesma transação da mudança de negócio. */
export interface Outbox<Transacao> {
  gravar(transacao: Transacao, eventos: readonly EventoDominio[]): Promise<void>;
}

export interface FilaDoRelay<Transacao> {
  /**
   * Reserva até `limite` eventos não publicados, na ordem em que foram gravados, pulando os
   * reservados por outra transação (`FOR UPDATE SKIP LOCKED`). A reserva dura até a transação acabar.
   */
  reservarPendentes(transacao: Transacao, limite: number): Promise<readonly EventoDominio[]>;
  marcarPublicados(transacao: Transacao, ids: readonly Uuid[], em: Instant): Promise<void>;
}

export interface RegistroDeProcessamento<Transacao> {
  /** Registra que o consumidor processou o evento. Devolve false se já estava registrado. */
  registrarSeNovo(transacao: Transacao, consumidor: string, eventoId: Uuid): Promise<boolean>;
}

/**
 * Um ciclo do relay: reserva um lote, publica cada evento e marca o lote como publicado, tudo
 * na mesma transação. Se o processo morrer depois de publicar e antes de confirmar, o lote volta
 * a ficar pendente e é publicado de novo: a entrega é "pelo menos uma vez" e a deduplicação
 * fica com os consumidores (`processarUmaVez`).
 */
export function publicarPendentes<Transacao>(
  unidade: UnidadeDeTrabalho<Transacao>,
  fila: FilaDoRelay<Transacao>,
  publicar: (evento: EventoDominio) => Promise<void>,
  relogio: Clock,
  limite: number,
): Promise<number> {
  return unidade.executar(async (transacao) => {
    const pendentes = await fila.reservarPendentes(transacao, limite);
    for (const evento of pendentes) {
      await publicar(evento);
    }
    if (pendentes.length > 0) {
      await fila.marcarPublicados(
        transacao,
        pendentes.map((evento) => evento.id),
        relogio.agora(),
      );
    }
    return pendentes.length;
  });
}

export type ResultadoConsumo = 'processado' | 'ignorado';

/**
 * Processa o evento uma única vez por consumidor (CLAUDE.md, seção 3: todo consumidor é
 * idempotente). O registro e os efeitos do tratamento são confirmados juntos: se o tratamento
 * falhar, nada é registrado e a nova tentativa processa de novo.
 */
export function processarUmaVez<Transacao, Evento extends EventoDominio>(
  unidade: UnidadeDeTrabalho<Transacao>,
  registro: RegistroDeProcessamento<Transacao>,
  consumidor: string,
  evento: Evento,
  tratar: (transacao: Transacao, evento: Evento) => Promise<void>,
): Promise<ResultadoConsumo> {
  return unidade.executar(async (transacao) => {
    if (!(await registro.registrarSeNovo(transacao, consumidor, evento.id))) return 'ignorado';
    await tratar(transacao, evento);
    return 'processado';
  });
}

/** Remoção dos registros antigos do outbox (eventos publicados e deduplicação). */
export interface LimpezaDoOutbox<Transacao> {
  /** Remove até `lote` eventos publicados antes de `limite`. Pendentes nunca são removidos. */
  removerPublicadosAntesDe(transacao: Transacao, limite: Instant, lote: number): Promise<number>;
  /** Remove até `lote` registros de processamento anteriores a `limite`. */
  removerProcessadosAntesDe(transacao: Transacao, limite: Instant, lote: number): Promise<number>;
}

export interface ResultadoLimpeza {
  readonly eventos: number;
  readonly processados: number;
}

/**
 * Remove o que passou da retenção, em lotes, cada um na sua transação (locks curtos, sem
 * travar o relay). O registro de processamento pode sair junto: é gravado depois da publicação,
 * então um registro mais antigo que a retenção é de um evento que também já saiu.
 */
export async function limparOutbox<Transacao>(
  unidade: UnidadeDeTrabalho<Transacao>,
  limpeza: LimpezaDoOutbox<Transacao>,
  relogio: Clock,
  opcoes: { readonly retencaoMs: number; readonly lote: number },
): Promise<ResultadoLimpeza> {
  if (opcoes.retencaoMs <= 0) throw new Error('A retenção do outbox deve ser positiva.');
  if (opcoes.lote <= 0) throw new Error('O lote da limpeza do outbox deve ser positivo.');
  const limite = relogio.agora().maisMs(-opcoes.retencaoMs);

  const emLotes = async (
    remover: (transacao: Transacao, limite: Instant, lote: number) => Promise<number>,
  ): Promise<number> => {
    let total = 0;
    for (;;) {
      const removidos = await unidade.executar((transacao) =>
        remover(transacao, limite, opcoes.lote),
      );
      total += removidos;
      if (removidos < opcoes.lote) return total;
    }
  };

  const eventos = await emLotes((tx, em, lote) => limpeza.removerPublicadosAntesDe(tx, em, lote));
  const processados = await emLotes((tx, em, lote) =>
    limpeza.removerProcessadosAntesDe(tx, em, lote),
  );
  return { eventos, processados };
}
