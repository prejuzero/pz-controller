import { Inject, Injectable } from '@nestjs/common';
import { ProcessarImportacaoDeProcessos } from '@pz/cadastro';
import { criarLogger } from '@pz/observability';

import { Consome } from '../eventos/consome.js';

import type { EventoDominio } from '@pz/kernel';

const logger = criarLogger('worker.cadastro');

/**
 * Importação de processos por CSV (HU42): cadastra as linhas validadas na transação do consumo;
 * repetir o evento encontra a importação concluída. Sem regra aqui.
 */
@Injectable()
export class ConsumidorDoCadastro {
  constructor(
    @Inject(ProcessarImportacaoDeProcessos)
    private readonly importacao: ProcessarImportacaoDeProcessos<unknown>,
  ) {}

  @Consome('ImportacaoDeProcessosSolicitada', { versao: 1 })
  async importacaoSolicitada(
    transacao: unknown,
    evento: EventoDominio<string, { importacaoId: string }>,
  ): Promise<void> {
    const desfecho = await this.importacao.executar(transacao, {
      tenantId: evento.tenantId,
      payload: evento.payload,
    });
    logger.info({ importacaoId: evento.payload.importacaoId, desfecho }, 'importação de processos');
  }
}
