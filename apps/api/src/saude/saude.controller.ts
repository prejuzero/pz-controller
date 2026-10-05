import { Controller, Get, Header, HttpCode, Inject, Res } from '@nestjs/common';
import { ConsultarSituacao } from '@pz/saude';

import { Publico } from '../http/acesso.js';

import type { SituacaoDaApi } from '@pz/contracts';
import type { FastifyReply } from 'fastify';

/** Contrato `consultarSituacao` (GET /v1/saude), em packages/contracts. */
@Controller('v1/saude')
export class SaudeController {
  constructor(@Inject(ConsultarSituacao) private readonly consultar: ConsultarSituacao) {}

  @Get()
  @Publico()
  @Header('Cache-Control', 'no-store')
  async situacao(): Promise<SituacaoDaApi> {
    const relatorio = await this.consultar.executar();
    return {
      situacao: relatorio.situacao,
      versao: relatorio.versao,
      verificadoEm: relatorio.verificadoEm.paraIso(),
    };
  }
}

/**
 * Sondas de infraestrutura (fora do /v1 e do contrato público): `live` diz se o processo está
 * de pé; `ready` diz se as dependências respondem, para o balanceador decidir se envia tráfego.
 */
@Controller('health')
export class SondasController {
  constructor(@Inject(ConsultarSituacao) private readonly consultar: ConsultarSituacao) {}

  @Get('live')
  @Publico()
  @HttpCode(200)
  vivo(): { situacao: 'vivo' } {
    return { situacao: 'vivo' };
  }

  @Get('ready')
  @Publico()
  async pronto(@Res({ passthrough: true }) resposta: FastifyReply) {
    const relatorio = await this.consultar.executar();
    void resposta.status(relatorio.situacao === 'operacional' ? 200 : 503);
    return {
      situacao: relatorio.situacao,
      dependencias: relatorio.dependencias.map(({ dependencia, disponivel, latenciaMs }) => ({
        dependencia,
        disponivel,
        latenciaMs,
      })),
    };
  }
}
