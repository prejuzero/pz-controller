import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { AprovarRamoDaClasse, ListarRamosDasClasses, ProporRamoDaClasse } from '@pz/prazos';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { RamosDasClasses, VersaoDoRamoDaClasse } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';
import type { CuradorEmAcao } from '@pz/prazos';

function curadorDe(requisicao: RequisicaoAutenticada): CuradorEmAcao {
  const { sessao } = autenticacao(requisicao);
  return {
    tenantId: sessao.tenantId,
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
  };
}

const Id = z.uuid();

/** Ramo pela classe processual do DJEN (curadoria); a regra fica no módulo prazos. */
@Controller('v1/admin/ramos-das-classes')
export class RamosDasClassesController {
  constructor(
    @Inject(ListarRamosDasClasses) private readonly listar: ListarRamosDasClasses<unknown>,
    @Inject(ProporRamoDaClasse) private readonly propor: ProporRamoDaClasse<unknown>,
    @Inject(AprovarRamoDaClasse) private readonly aprovar: AprovarRamoDaClasse<unknown>,
  ) {}

  @Get()
  @RequerPermissao('curadoria:tabela-prazos')
  async classes(): Promise<RamosDasClasses> {
    return { itens: await this.listar.executar() };
  }

  @Post()
  @RequerPermissao('curadoria:tabela-prazos')
  @HttpCode(201)
  async proporRamo(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<VersaoDoRamoDaClasse> {
    const r = await this.propor.executar(curadorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Post(':id/aprovar')
  @RequerPermissao('curadoria:tabela-prazos')
  @HttpCode(200)
  async aprovarRamo(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<VersaoDoRamoDaClasse> {
    const r = await this.aprovar.executar(curadorDe(requisicao), validar(Id, id) as Uuid);
    if (!r.ok) throw r.erro;
    return r.valor;
  }
}
