import { Body, Controller, Delete, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ReprocessarJobMorto } from '@pz/administracao';
import { PedidoDeImpersonacao, PedidoDeReprocessamento } from '@pz/contracts';
import { ConsultarPermissoes, EncerrarImpersonacao, IniciarImpersonacao } from '@pz/identidade';

import { autenticacao, contextoDe, sessaoAtual, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { SessaoAtual } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

/**
 * Contratos `iniciarImpersonacao` e `encerrarImpersonacao` (regra no módulo identidade) e
 * `reprocessarJobMorto` (regra no módulo administracao), da HU07.
 */
@Controller('v1/admin')
export class AdminController {
  constructor(
    @Inject(IniciarImpersonacao) private readonly iniciar: IniciarImpersonacao<unknown>,
    @Inject(EncerrarImpersonacao) private readonly encerrar: EncerrarImpersonacao<unknown>,
    @Inject(ConsultarPermissoes) private readonly consultarPermissoes: ConsultarPermissoes,
    @Inject(ReprocessarJobMorto) private readonly reprocessar: ReprocessarJobMorto<unknown>,
  ) {}

  @Post('impersonacao')
  @RequerPermissao('admin:impersonar')
  @HttpCode(201)
  async iniciarImpersonacao(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<SessaoAtual> {
    const { token, sessao } = autenticacao(requisicao);
    const pedido = validar(PedidoDeImpersonacao.esquema, corpo);
    const resultado = await this.iniciar.executar(
      token,
      sessao,
      { tenantId: pedido.tenantId as Uuid, motivo: pedido.motivo },
      contextoDe(requisicao),
    );
    if (!resultado.ok) throw resultado.erro;
    return sessaoAtual(resultado.valor, await this.consultarPermissoes.executar(resultado.valor));
  }

  @Delete('impersonacao')
  @RequerPermissao('admin:impersonar')
  @HttpCode(204)
  async encerrarImpersonacao(@Req() requisicao: RequisicaoAutenticada): Promise<void> {
    const { token, sessao } = autenticacao(requisicao);
    await this.encerrar.executar(token, sessao, contextoDe(requisicao));
  }

  @Post('filas/:fila/dlq/:jobId/reprocessar')
  @RequerPermissao('admin:filas')
  @HttpCode(204)
  async reprocessarJobMorto(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('fila') fila: string,
    @Param('jobId') jobId: string,
    @Body() corpo: unknown,
  ): Promise<void> {
    const { sessao } = autenticacao(requisicao);
    const { motivo } = validar(PedidoDeReprocessamento.esquema, corpo);
    const resultado = await this.reprocessar.executar({
      fila,
      jobId,
      motivo,
      usuarioId: sessao.usuarioId,
      ...contextoDe(requisicao),
    });
    if (!resultado.ok) throw resultado.erro;
  }
}
