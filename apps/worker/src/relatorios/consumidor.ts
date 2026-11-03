import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { Consome } from '../eventos/consome.js';
import { FILAS_RUNTIME } from '../fichas.js';

import { gerarRelatorioJob } from './jobs.js';

import type { Filas } from '../filas/runtime.js';
import type { EventoDominio } from '@pz/kernel';

const Pedido = z.object({ relatorioId: z.uuid() });

/**
 * Leva o pedido de relatório (HU29) à fila relatorios, separada dos eventos: gerar 5.000 linhas
 * não segura a fila de eventos. Repetir o evento republica o mesmo job. Sem regra aqui.
 */
@Injectable()
export class ConsumidorDosRelatorios {
  constructor(@Inject(FILAS_RUNTIME) private readonly filas: Filas) {}

  @Consome('RelatorioSolicitado', { versao: 1 })
  async relatorioSolicitado(_transacao: unknown, evento: EventoDominio): Promise<void> {
    const { relatorioId } = Pedido.parse(evento.payload);
    await this.filas.publicar(
      gerarRelatorioJob,
      { relatorioId, tenantId: evento.tenantId },
      { tenantId: evento.tenantId },
      relatorioId,
    );
  }
}
