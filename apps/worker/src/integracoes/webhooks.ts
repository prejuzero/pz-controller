import { Inject, Injectable } from '@nestjs/common';
import { WebhooksPostgres } from '@pz/db';
import { criarLogger, registrarErro } from '@pz/observability';
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';

import { AMBIENTE, FILAS_RUNTIME, UNIDADE_DOS_WEBHOOKS } from '../fichas.js';
import { definirJob } from '../filas/job.js';
import { Filas } from '../filas/runtime.js';

import type { AmbienteWorker } from '../ambiente.js';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Transacao, WebhookPendente } from '@pz/db';
import type { Clock, UnidadeDeTrabalho } from '@pz/kernel';

const logger = criarLogger('worker.webhooks');
const webhooks = new WebhooksPostgres();

/**
 * Trata o webhook de um adaptador (ex.: eventos de entrega de e-mail, HU30) na transação global
 * que o marca como processado: o efeito e a marca são confirmados juntos. Idempotente.
 */
export type ProcessadorDeWebhook = (
  transacao: Transacao,
  webhook: WebhookPendente,
) => Promise<void>;

export const processarWebhook = definirJob({
  fila: 'integracoes',
  tipo: 'integracoes.processar-webhook',
  dados: z.object({ id: z.uuid() }).strict(),
  global: true, // o tenant só é conhecido ao interpretar o webhook
});

/** Processa um webhook gravado pelo gateway; repetido (já processado) é ignorado. */
export async function tratarWebhook(
  unidade: UnidadeDeTrabalho<Transacao>,
  processadores: ReadonlyMap<string, ProcessadorDeWebhook>,
  relogio: Clock,
  id: string,
): Promise<void> {
  await unidade.executar(async (tx) => {
    const webhook = await webhooks.pendente(tx, id);
    if (webhook === undefined) return;
    const processador = processadores.get(webhook.adaptador);
    if (processador === undefined) {
      throw new UnrecoverableError(`nenhum processador de webhook para ${webhook.adaptador}`);
    }
    await processador(tx, webhook);
    await webhooks.marcarProcessado(tx, id, relogio.agora());
  });
}

/**
 * Leva os webhooks gravados pela api para a fila `integracoes` (como o relay do outbox):
 * reserva e publica na mesma transação; se cair no meio, o ID do job evita duplicar.
 */
@Injectable()
export class RelayDeWebhooks implements OnApplicationBootstrap, OnApplicationShutdown {
  #temporizador: NodeJS.Timeout | undefined;
  #ciclo: Promise<void> | undefined;

  constructor(
    @Inject(AMBIENTE) private readonly ambiente: AmbienteWorker,
    @Inject(UNIDADE_DOS_WEBHOOKS) private readonly unidade: UnidadeDeTrabalho<Transacao>,
    @Inject(FILAS_RUNTIME) private readonly filas: Filas,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.filas.filasAtivas().includes('integracoes')) return;
    this.#temporizador = setInterval(() => {
      this.#ciclo ??= this.#executarCiclo().finally(() => {
        this.#ciclo = undefined;
      });
    }, this.ambiente.RELAY_INTERVALO_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.#temporizador);
    await this.#ciclo;
  }

  async #executarCiclo(): Promise<void> {
    try {
      await this.unidade.executar(async (tx) => {
        for (const id of await webhooks.reservarParaEnfileirar(tx, 100)) {
          await this.filas.publicar(
            processarWebhook,
            { id },
            { global: true, motivo: 'webhook de entrada' },
            id,
          );
        }
      });
    } catch (erro) {
      registrarErro(logger, erro, 'falha ao enfileirar webhooks recebidos', 'worker.webhooks');
    }
  }
}
