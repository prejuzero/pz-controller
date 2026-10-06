import { Body, Controller, Delete, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { PedidoDeImpersonacao } from '@pz/contracts';
import { ConsultarPermissoes, EncerrarImpersonacao, IniciarImpersonacao } from '@pz/identidade';

import { autenticacao, contextoDe, sessaoAtual, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { SessaoAtual } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

/** Contratos `iniciarImpersonacao` e `encerrarImpersonacao` (HU07). Regra no módulo identidade. */
@Controller('v1/admin')
export class AdminController {
  constructor(
    @Inject(IniciarImpersonacao) private readonly iniciar: IniciarImpersonacao<unknown>,
    @Inject(EncerrarImpersonacao) private readonly encerrar: EncerrarImpersonacao<unknown>,
    @Inject(ConsultarPermissoes) private readonly consultarPermissoes: ConsultarPermissoes,
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
}
