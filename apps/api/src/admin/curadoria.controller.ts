import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { DecidirCandidato, ExportarCasosAceitos, ListarCandidatos } from '@pz/classificacao';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { CasoCandidato } from '@pz/classificacao';
import type {
  CasoCandidato as Contrato,
  CasosExportados,
  PaginaDeCasosCandidatos,
} from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

const idDe = (id: string) => validar(z.uuid(), id) as Uuid;
const listado = (c: CasoCandidato): Contrato => ({
  ...c,
  decididoEm: c.decididoEm?.paraIso() ?? null,
});

/** Curadoria a partir das correções dos advogados (HU22); a regra fica no módulo classificacao. */
@Controller('v1/admin/classificacoes/candidatos')
export class CuradoriaDaClassificacaoController {
  constructor(
    @Inject(ListarCandidatos) private readonly listar: ListarCandidatos<unknown>,
    @Inject(DecidirCandidato) private readonly decidir: DecidirCandidato<unknown>,
    @Inject(ExportarCasosAceitos) private readonly exportar: ExportarCasosAceitos<unknown>,
  ) {}

  @Get()
  @RequerPermissao('curadoria:classificacao')
  async listarCandidatos(@Query() consulta: unknown): Promise<PaginaDeCasosCandidatos> {
    const r = await this.listar.executar(consulta);
    if (!r.ok) throw r.erro;
    return { itens: r.valor.itens.map(listado), proximoCursor: r.valor.proximoCursor };
  }

  @Get('exportacao')
  @RequerPermissao('curadoria:classificacao')
  async exportarAceitos(): Promise<CasosExportados> {
    return { casos: await this.exportar.executar() };
  }

  @Post(':id/decisao')
  @RequerPermissao('curadoria:classificacao')
  @HttpCode(200)
  async decidirCandidato(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<Contrato> {
    const { sessao } = autenticacao(requisicao);
    const r = await this.decidir.executar(
      {
        usuarioId: sessao.usuarioId,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
      },
      idDe(id),
      corpo,
    );
    if (!r.ok) throw r.erro;
    return listado(r.valor);
  }
}
