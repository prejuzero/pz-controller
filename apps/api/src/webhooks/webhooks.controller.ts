import {
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { criarLogger, registrarWebhookRecusado } from '@pz/observability';

import { CAIXA_DE_WEBHOOKS, RECEPTORES_DE_WEBHOOK } from '../fichas.js';
import { Publico } from '../http/acesso.js';
import { LimitarPorIp } from '../http/limite.js';

import type { RawBodyRequest } from '@nestjs/common';
import type { WebhookAceito } from '@pz/contracts';
import type { WebhookParaGravar } from '@pz/db';
import type { ReceptorWebhook, RequisicaoWebhook } from '@pz/integracoes';
import type { FastifyRequest } from 'fastify';

const logger = criarLogger('api.webhooks');
/** Cabeçalhos que nunca são gravados (credenciais do chamador). */
const NAO_GRAVAR = new Set(['authorization', 'cookie', 'proxy-authorization']);

/** Onde o webhook aceito é gravado (PostgreSQL em produção, memória nos testes). */
export interface CaixaDeWebhooks {
  /** false se o mesmo webhook (adaptador, ID externo) já tinha chegado. */
  gravar(webhook: WebhookParaGravar): Promise<boolean>;
}

/**
 * Contrato `receberWebhook` (POST /v1/webhooks/{adaptador}). Só verifica e grava: responde
 * rápido e o processamento acontece no worker, na fila `integracoes`, com retentativa e DLQ.
 */
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(
    @Inject(CAIXA_DE_WEBHOOKS) private readonly caixa: CaixaDeWebhooks,
    @Inject(RECEPTORES_DE_WEBHOOK)
    private readonly receptores: ReadonlyMap<string, ReceptorWebhook>,
  ) {}

  @Post(':adaptador')
  @Publico()
  @LimitarPorIp(300)
  @HttpCode(202)
  async receber(
    @Param('adaptador') adaptador: string,
    @Req() pedido: RawBodyRequest<FastifyRequest>,
  ): Promise<WebhookAceito> {
    const receptor = this.receptores.get(adaptador);
    if (receptor === undefined) throw new NotFoundException();
    const cabecalhos = Object.fromEntries(
      Object.entries(pedido.headers)
        .filter(([nome, valor]) => !NAO_GRAVAR.has(nome) && typeof valor === 'string')
        .map(([nome, valor]) => [nome, String(valor)]),
    );
    const requisicao: RequisicaoWebhook = {
      cabecalhos,
      corpo: new Uint8Array(pedido.rawBody ?? Buffer.alloc(0)),
    };
    if (!(await receptor.verificarAssinatura(requisicao))) {
      registrarWebhookRecusado(adaptador);
      logger.warn({ adaptador }, 'webhook recusado: assinatura inválida');
      throw new UnauthorizedException();
    }
    const novo = await this.caixa.gravar({
      adaptador,
      idExterno: receptor.idExterno(requisicao),
      ...requisicao,
    });
    return { duplicado: !novo };
  }
}
