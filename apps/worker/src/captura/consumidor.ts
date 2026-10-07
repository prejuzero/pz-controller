import { Inject, Injectable } from '@nestjs/common';
import { ManterAssinaturas } from '@pz/captura';

import { Consome } from '../eventos/consome.js';

import type { EventoDominio } from '@pz/kernel';

/** Mantém os alvos da captura a partir do cadastro (HU17). Sem regra aqui. */
@Injectable()
export class ConsumidorDaCaptura {
  constructor(
    @Inject(ManterAssinaturas) private readonly assinaturas: ManterAssinaturas<unknown>,
  ) {}

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
}
