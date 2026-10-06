import { Inject, Injectable } from '@nestjs/common';
import { InvalidarCacheDoCalendario } from '@pz/calendario';

import { Consome } from '../eventos/consome.js';

import type { EventoDominio } from '@pz/kernel';

/** Liga a invalidação do cache do calendário ao CalendarioAlterado (HU13). Sem regra aqui. */
@Injectable()
export class ConsumidorDoCalendario {
  constructor(
    @Inject(InvalidarCacheDoCalendario) private readonly invalidar: InvalidarCacheDoCalendario,
  ) {}

  @Consome('CalendarioAlterado', { versao: 1 })
  alterado(_transacao: unknown, evento: EventoDominio): Promise<void> {
    return this.invalidar.executar(evento);
  }
}
