import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ConsultarAvisosDeEntrega } from '@pz/notificacoes';

import { autenticacao } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { AvisosDeEntrega } from '@pz/notificacoes';

/** Avisos de entrega para a faixa do portal (HU30); a regra fica no módulo notificacoes. */
@Controller('v1/notificacoes')
export class NotificacoesController {
  constructor(
    @Inject(ConsultarAvisosDeEntrega)
    private readonly avisos: ConsultarAvisosDeEntrega<unknown>,
  ) {}

  @Get('avisos')
  @RequerPermissao('conta:gerir')
  consultarAvisos(@Req() requisicao: RequisicaoAutenticada): Promise<AvisosDeEntrega> {
    const { sessao, permissoes } = autenticacao(requisicao);
    return this.avisos.executar(sessao.usuarioId, permissoes.has('usuarios:gerir'));
  }
}
