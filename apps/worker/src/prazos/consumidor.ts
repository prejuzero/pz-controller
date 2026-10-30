import { Inject, Injectable } from '@nestjs/common';
import { criarLogger } from '@pz/observability';
import { lerAlteracaoDoCalendario, TenantsAfetadosPeloCalendario } from '@pz/prazos';

import { Consome } from '../eventos/consome.js';
import { FILAS_RUNTIME } from '../fichas.js';

import { chaveDoLote, recalcularPrazosJob } from './jobs.js';

import type { DadosDoRecalculo } from './jobs.js';
import type { Filas } from '../filas/runtime.js';
import type { EventoDominio } from '@pz/kernel';

const logger = criarLogger('worker.prazos');

/**
 * Liga o recálculo dos prazos ao CalendarioAlterado (HU16): um job por tenant alcançado, na fila
 * prazos. Repetir o evento republica os mesmos jobs (mesma chave), sem duplicar. Sem regra aqui.
 */
@Injectable()
export class ConsumidorDosPrazos {
  constructor(
    @Inject(TenantsAfetadosPeloCalendario)
    private readonly tenants: TenantsAfetadosPeloCalendario<unknown>,
    @Inject(FILAS_RUNTIME) private readonly filas: Filas,
  ) {}

  @Consome('CalendarioAlterado', { versao: 1 })
  async calendarioAlterado(_transacao: unknown, evento: EventoDominio): Promise<void> {
    const alteracao = lerAlteracaoDoCalendario(evento);
    const tenants = await this.tenants.executar(alteracao);
    for (const tenantId of tenants) {
      const dados: DadosDoRecalculo = {
        evento: {
          id: evento.id,
          tenantId: evento.tenantId,
          payload: evento.payload as Record<string, unknown>,
        },
        tenantId,
        depoisDe: null,
      };
      await this.filas.publicar(recalcularPrazosJob, dados, { tenantId }, chaveDoLote(dados));
    }
    logger.info(
      { eventoId: evento.id, origem: alteracao.origem, tenants: tenants.length },
      'recálculo de prazos planejado',
    );
  }
}
