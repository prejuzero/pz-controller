import { Inject, Injectable } from '@nestjs/common';
import { ClassificarPublicacao, RegistrarCandidatoDeCuradoria } from '@pz/classificacao';
import { criarLogger } from '@pz/observability';

import { Consome } from '../eventos/consome.js';

import type { EventoDominio } from '@pz/kernel';

const logger = criarLogger('worker.classificacao');

/** Classificação de cada conteúdo novo (HU21), uma vez por conteúdo. Sem regra aqui. */
@Injectable()
export class ConsumidorDaClassificacao {
  constructor(
    @Inject(ClassificarPublicacao) private readonly classificar: ClassificarPublicacao<unknown>,
    @Inject(RegistrarCandidatoDeCuradoria)
    private readonly candidatos: RegistrarCandidatoDeCuradoria<unknown>,
  ) {}

  /** Correção do advogado vira caso candidato da curadoria (HU22), na transação do consumo. */
  @Consome('PrazoAjustado', { versao: 1 })
  async prazoAjustado(transacao: unknown, evento: EventoDominio): Promise<void> {
    const resultado = await this.candidatos.executar(transacao, evento);
    logger.info({ prazoId: evento.agregadoId, resultado }, 'correção avaliada para a curadoria');
  }

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
