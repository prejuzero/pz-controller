import { Inject, Injectable } from '@nestjs/common';
import { GerarExportacao } from '@pz/privacidade';

import { Consome } from '../eventos/consome.js';

import type { EventoDominio } from '@pz/kernel';

/** Gera os arquivos da exportação de dados (HU38) na transação do tenant. Sem regra aqui. */
@Injectable()
export class ConsumidorDaPrivacidade {
  constructor(@Inject(GerarExportacao) private readonly gerar: GerarExportacao<unknown>) {}

  @Consome('ExportacaoDeDadosSolicitada', { versao: 1 })
  exportacaoSolicitada(transacao: unknown, evento: EventoDominio): Promise<void> {
    return this.gerar.executar(transacao, evento);
  }
}
