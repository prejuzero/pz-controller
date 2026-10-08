import { Inject, Injectable } from '@nestjs/common';
import { criarLogger } from '@pz/observability';
import { IngerirCaptura } from '@pz/publicacoes';

import { Consome } from '../eventos/consome.js';

import type { EventoDominio } from '@pz/kernel';

const logger = criarLogger('worker.publicacoes');

/** Ingestão das publicações capturadas (HU18) na transação do tenant. Sem regra aqui. */
@Injectable()
export class ConsumidorDasPublicacoes {
  constructor(@Inject(IngerirCaptura) private readonly ingerir: IngerirCaptura<unknown>) {}

  @Consome('CapturaConcluida', { versao: 1 })
  async capturaConcluida(transacao: unknown, evento: EventoDominio): Promise<void> {
    const resultado = await this.ingerir.executar(transacao, evento);
    logger.info({ ...resultado, alvoId: evento.agregadoId }, 'publicações ingeridas');
  }
}
