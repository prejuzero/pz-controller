import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ConsultarRelatorios, SolicitarRelatorio } from '@pz/relatorios';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { Relatorio, Relatorios, RelatorioSolicitado } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

const Id = z.uuid();

/** Relatórios e exportação (HU29); a regra fica no módulo relatorios, a geração no worker. */
@Controller('v1/relatorios')
export class RelatoriosController {
  constructor(
    @Inject(SolicitarRelatorio) private readonly solicitar: SolicitarRelatorio<unknown>,
    @Inject(ConsultarRelatorios) private readonly consultar: ConsultarRelatorios<unknown>,
  ) {}

  @Post()
  @RequerPermissao('relatorios:exportar')
  @HttpCode(202)
  async solicitarRelatorio(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<RelatorioSolicitado> {
    const { sessao, permissoes } = autenticacao(requisicao);
    const r = await this.solicitar.executar(
      {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
        veTodosOsHistoricos: permissoes.has('usuarios:gerir'),
      },
      corpo,
    );
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Get()
  @RequerPermissao('relatorios:exportar')
  async listarRelatorios(@Req() requisicao: RequisicaoAutenticada): Promise<Relatorios> {
    const itens = await this.consultar.recentes({
      usuarioId: autenticacao(requisicao).sessao.usuarioId,
    });
    return { itens: [...itens] };
  }

  @Get(':id')
  @RequerPermissao('relatorios:exportar')
  async consultarRelatorio(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<Relatorio> {
    const r = await this.consultar.um(
      { usuarioId: autenticacao(requisicao).sessao.usuarioId },
      validar(Id, id) as Uuid,
    );
    if (!r.ok) throw r.erro;
    return r.valor;
  }
}
