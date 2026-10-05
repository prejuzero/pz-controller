import { Inject, Injectable } from '@nestjs/common';
import { RegistrarHistoricoDeSituacao } from '@pz/saude';

import { Consome } from '../eventos/consome.js';

import type { SituacaoVerificada } from '@pz/saude';

/** Liga o consumidor do módulo saude ao evento `SituacaoVerificada` v1. Sem regra aqui. */
@Injectable()
export class ConsumidorDeSituacao {
  constructor(
    @Inject(RegistrarHistoricoDeSituacao)
    private readonly registrar: RegistrarHistoricoDeSituacao<unknown>,
  ) {}

  @Consome('SituacaoVerificada', { versao: 1 })
  tratar(transacao: unknown, evento: SituacaoVerificada): Promise<void> {
    return this.registrar.tratar(transacao, evento);
  }
}
