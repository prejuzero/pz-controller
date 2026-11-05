import { Inject, Injectable } from '@nestjs/common';
import { criarLogger, registrarPublicacaoVisivel } from '@pz/observability';
import { IngerirCaptura } from '@pz/publicacoes';

import { Consome } from '../eventos/consome.js';
import { RELOGIO } from '../fichas.js';

import type { Clock, EventoDominio } from '@pz/kernel';

const logger = criarLogger('worker.publicacoes');

/** Ingestão das publicações capturadas (HU18) na transação do tenant. Sem regra aqui. */
@Injectable()
export class ConsumidorDasPublicacoes {
  constructor(
    @Inject(IngerirCaptura) private readonly ingerir: IngerirCaptura<unknown>,
    @Inject(RELOGIO) private readonly relogio: Clock,
  ) {}

  @Consome('CapturaConcluida', { versao: 1 })
  async capturaConcluida(transacao: unknown, evento: EventoDominio): Promise<void> {
    const resultado = await this.ingerir.executar(transacao, evento);
    logger.info({ ...resultado, alvoId: evento.agregadoId }, 'publicações ingeridas');
    // SLO (HU40): da captura (evento CapturaConcluida) até a publicação visível no portal.
    if (resultado.recebidas > 0) {
      const { fonte } = evento.payload as { fonte?: unknown };
      registrarPublicacaoVisivel(
        typeof fonte === 'string' ? fonte : 'desconhecida',
        (this.relogio.agora().epochMs - evento.ocorridoEm.epochMs) / 1000,
      );
    }
  }
}
