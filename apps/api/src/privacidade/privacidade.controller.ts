import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ConsultarExportacao, SolicitarExportacao } from '@pz/privacidade';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { ExportacaoDeDados, ExportacaoSolicitada } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

const Id = z.uuid();

/** Direitos do titular (HU38, LGPD); a regra fica no módulo privacidade. */
@Controller('v1/privacidade')
export class PrivacidadeController {
  constructor(
    @Inject(SolicitarExportacao) private readonly solicitar: SolicitarExportacao<unknown>,
    @Inject(ConsultarExportacao) private readonly consultar: ConsultarExportacao<unknown>,
  ) {}

  @Post('exportacoes')
  @RequerPermissao('conta:gerir')
  @HttpCode(202)
  async solicitarExportacao(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<ExportacaoSolicitada> {
    const { sessao, permissoes } = autenticacao(requisicao);
    const r = await this.solicitar.executar(
      {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
        podeExportarEscritorio: permissoes.has('escritorio:exportar'),
      },
      corpo,
    );
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Get('exportacoes/:id')
  @RequerPermissao('conta:gerir')
  async consultarExportacao(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<ExportacaoDeDados> {
    const { sessao } = autenticacao(requisicao);
    const r = await this.consultar.executar(sessao, validar(Id, id) as Uuid);
    if (!r.ok) throw r.erro;
    return { ...r.valor, arquivos: [...r.valor.arquivos] };
  }
}
