import { Inject, Injectable } from '@nestjs/common';
import { ClassificarPublicacao } from '@pz/classificacao';
import { criarLogger } from '@pz/observability';

import { Consome } from '../eventos/consome.js';

import type { EventoDominio } from '@pz/kernel';

const logger = criarLogger('worker.classificacao');

/** Classificação de cada conteúdo novo (HU21), uma vez por conteúdo. Sem regra aqui. */
@Injectable()
export class ConsumidorDaClassificacao {
  constructor(
    @Inject(ClassificarPublicacao) private readonly classificar: ClassificarPublicacao<unknown>,
  ) {}

  @Consome('PublicacaoNova', { versao: 1 })
  async publicacaoNova(
    transacao: unknown,
    evento: EventoDominio<string, { conteudoId: string }>,
  ): Promise<void> {
    const c = await this.classificar.executar(transacao, {
      tenantId: evento.tenantId,
      payload: evento.payload,
    });
    if (c !== undefined) {
      logger.info(
        { conteudoId: evento.payload.conteudoId, origem: c.origem, situacao: c.situacao },
        'publicação classificada',
      );
    }
  }
}
