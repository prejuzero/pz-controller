import { Inject, Injectable } from '@nestjs/common';
import { ManterAssinaturas, PlanejarBuscaAgora } from '@pz/captura';
import { criarLogger } from '@pz/observability';

import { Consome } from '../eventos/consome.js';
import { FILAS_RUNTIME } from '../fichas.js';

import { ESCOPO_DA_CAPTURA, executarCapturaJob } from './jobs.js';

import type { Filas } from '../filas/runtime.js';
import type { EventoDominio } from '@pz/kernel';

const logger = criarLogger('worker.captura');

/** Mantém os alvos da captura a partir do cadastro (HU17) e atende o "buscar agora". Sem regra aqui. */
@Injectable()
export class ConsumidorDaCaptura {
  constructor(
    @Inject(ManterAssinaturas) private readonly assinaturas: ManterAssinaturas<unknown>,
    @Inject(PlanejarBuscaAgora) private readonly buscaAgora: PlanejarBuscaAgora<unknown>,
    @Inject(FILAS_RUNTIME) private readonly filas: Filas,
  ) {}

  /** Busca pedida pelo escritório: já na fila, sem o jitter da rodada. Repetir não duplica. */
  @Consome('BuscaAgoraSolicitada', { versao: 1 })
  async buscaAgoraSolicitada(transacao: unknown, evento: EventoDominio): Promise<void> {
    const plano = await this.buscaAgora.aoSolicitar(transacao, evento);
    if (plano === undefined) {
      logger.info({ eventoId: evento.id }, 'busca pedida para alvo inativo: nada a buscar');
      return;
    }
    const { chave, ...dados } = plano;
    await this.filas.publicar(executarCapturaJob, dados, ESCOPO_DA_CAPTURA, chave);
    logger.info({ alvoId: plano.alvoId, eventoId: evento.id }, 'busca agora enfileirada');
  }

  @Consome('OabAdicionada', { versao: 1 })
  oabAdicionada(transacao: unknown, evento: EventoDominio): Promise<void> {
    return this.assinaturas.oabAdicionada(transacao, evento);
  }

  @Consome('OabRemovida', { versao: 1 })
  oabRemovida(transacao: unknown, evento: EventoDominio): Promise<void> {
    return this.assinaturas.oabRemovida(transacao, evento);
  }

  @Consome('ProcessoMonitorado', { versao: 1 })
  processoMonitorado(transacao: unknown, evento: EventoDominio): Promise<void> {
    return this.assinaturas.processoMonitorado(transacao, evento);
  }

  /** Nomes do escritório (HU42). */
  @Consome('NomeMonitoradoAdicionado', { versao: 1 })
  nomeAdicionado(transacao: unknown, evento: EventoDominio): Promise<void> {
    return this.assinaturas.nomeAdicionado(transacao, evento);
  }

  @Consome('NomeMonitoradoRemovido', { versao: 1 })
  nomeRemovido(transacao: unknown, evento: EventoDominio): Promise<void> {
    return this.assinaturas.nomeRemovido(transacao, evento);
  }
}
