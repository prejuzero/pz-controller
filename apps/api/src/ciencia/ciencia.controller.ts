import { Body, Controller, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ConfirmarCiencia, ConsultarLinkDeCiencia } from '@pz/ciencia';
import { PedidoComToken, PedidoDeCienciaEmLote } from '@pz/contracts';
import { criarLogger, registrarErro } from '@pz/observability';
import { z } from 'zod';

import { autenticacao, contextoDe, validar } from '../auth/auth.controller.js';
import { Publico, RequerPermissao } from '../http/acesso.js';
import { LimitarPorIp } from '../http/limite.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { ResultadoDaConfirmacao } from '@pz/ciencia';
import type { CienciaEmLote, CienciaRegistrada, LinkDeCiencia } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';
import type { FastifyRequest } from 'fastify';

const logger = criarLogger('api.ciencia');

const registrada = (r: ResultadoDaConfirmacao): CienciaRegistrada => ({
  prazoId: r.prazoId,
  confirmadaEm: r.confirmadaEm.paraIso(),
  jaConfirmada: r.jaConfirmada,
});

/**
 * Ciência (HU33): o link do e-mail só mostra (consulta) e confirma num POST explícito; no portal
 * e no app, a mesma confirmação pela sessão. A regra fica no módulo ciencia.
 */
@Controller('v1')
export class CienciaController {
  constructor(
    @Inject(ConsultarLinkDeCiencia) private readonly consultar: ConsultarLinkDeCiencia<unknown>,
    @Inject(ConfirmarCiencia) private readonly confirmar: ConfirmarCiencia<unknown>,
  ) {}

  @Post('ciencia/consulta')
  @Publico()
  @LimitarPorIp(30)
  @HttpCode(200)
  async consultarLink(@Body() corpo: unknown): Promise<LinkDeCiencia> {
    const r = await this.consultar.executar(validar(PedidoComToken.esquema, corpo).token);
    return {
      situacao: r.situacao,
      ...(r.prazo === undefined
        ? {}
        : {
            prazo: {
              numeroProcesso: r.prazo.numeroProcesso,
              tipoAto: r.prazo.tipoAto,
              vencimento: r.prazo.vencimento,
            },
          }),
      ...(r.confirmadaEm === undefined ? {} : { confirmadaEm: r.confirmadaEm.paraIso() }),
    };
  }

  @Post('ciencia/confirmacao')
  @Publico()
  @LimitarPorIp(10)
  @HttpCode(200)
  async confirmarPeloLink(
    @Req() requisicao: FastifyRequest,
    @Body() corpo: unknown,
  ): Promise<CienciaRegistrada> {
    const { token } = validar(PedidoComToken.esquema, corpo);
    const r = await this.confirmar.peloLink(token, contextoDe(requisicao));
    if (!r.ok) throw r.erro;
    return registrada(r.valor);
  }

  @Post('prazos/:id/ciencia')
  @RequerPermissao('prazos:confirmar')
  @HttpCode(200)
  async confirmarPelaSessao(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<CienciaRegistrada> {
    const { sessao } = autenticacao(requisicao);
    const r = await this.confirmar.pelaSessao(
      {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
      },
      validar(z.uuid(), id) as Uuid,
      contextoDe(requisicao),
    );
    if (!r.ok) throw r.erro;
    return registrada(r.valor);
  }

  @Post('ciencia/lote')
  @RequerPermissao('prazos:confirmar')
  @HttpCode(200)
  async confirmarEmLote(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<CienciaEmLote> {
    const { sessao } = autenticacao(requisicao);
    const { prazoIds } = validar(PedidoDeCienciaEmLote.esquema, corpo);
    const r = await this.confirmar.emLote(
      {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
      },
      prazoIds as Uuid[],
      contextoDe(requisicao),
    );
    // Nada falha em silêncio: o item volta "falhou" e o erro vai para o log e o Sentry.
    for (const erro of r.inesperadas)
      registrarErro(logger, erro, 'falha inesperada na ciência em lote', 'api.ciencia');
    return {
      itens: r.itens.map((i) =>
        i.situacao === 'falhou'
          ? { prazoId: i.prazoId, situacao: i.situacao, confirmadaEm: null, codigo: i.codigo }
          : {
              prazoId: i.prazoId,
              situacao: i.situacao,
              confirmadaEm: i.confirmadaEm.paraIso(),
              codigo: null,
            },
      ),
    };
  }
}
