import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { AceiteDeConvite, TokenDoConvite } from '@pz/contracts';
import {
  AceitarConvite,
  AlterarPerfisDoMembro,
  CancelarConvite,
  ConvidarMembro,
  DescreverConvite,
  DesativarMembro,
  ListarEquipe,
} from '@pz/identidade';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { Publico, RequerPermissao } from '../http/acesso.js';
import { LimitarPorIp } from '../http/limite.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { ConviteDeMembro, ConviteDescrito, EquipeDoEscritorio } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

const Id = z.uuid();

function autor(requisicao: RequisicaoAutenticada) {
  const { sessao } = autenticacao(requisicao);
  return { tenantId: sessao.tenantId, usuarioId: sessao.usuarioId };
}

/** Equipe do escritório (HU41): a regra fica no módulo identidade. */
@Controller('v1/equipe')
export class EquipeController {
  constructor(
    @Inject(ListarEquipe) private readonly listar: ListarEquipe<unknown>,
    @Inject(ConvidarMembro) private readonly convidar: ConvidarMembro<unknown>,
    @Inject(CancelarConvite) private readonly cancelar: CancelarConvite<unknown>,
    @Inject(AlterarPerfisDoMembro) private readonly alterar: AlterarPerfisDoMembro<unknown>,
    @Inject(DesativarMembro) private readonly desativar: DesativarMembro<unknown>,
    @Inject(DescreverConvite) private readonly descrever: DescreverConvite<unknown>,
    @Inject(AceitarConvite) private readonly aceitar: AceitarConvite<unknown>,
  ) {}

  @Get()
  @RequerPermissao('usuarios:gerir')
  equipe(): Promise<EquipeDoEscritorio> {
    return this.listar.executar();
  }

  @Post('convites')
  @RequerPermissao('usuarios:gerir')
  @HttpCode(201)
  async convidarMembro(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<ConviteDeMembro> {
    const r = await this.convidar.executar(autor(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Delete('convites/:id')
  @RequerPermissao('usuarios:gerir')
  @HttpCode(204)
  async cancelarConvite(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const r = await this.cancelar.executar(autor(requisicao), validar(Id, id) as Uuid);
    if (!r.ok) throw r.erro;
  }

  @Put('membros/:id/perfis')
  @RequerPermissao('usuarios:gerir')
  @HttpCode(204)
  async alterarPerfis(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<void> {
    const r = await this.alterar.executar(autor(requisicao), validar(Id, id) as Uuid, corpo);
    if (!r.ok) throw r.erro;
  }

  @Post('membros/:id/desativar')
  @RequerPermissao('usuarios:gerir')
  @HttpCode(204)
  async desativarMembro(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const r = await this.desativar.executar(autor(requisicao), validar(Id, id) as Uuid);
    if (!r.ok) throw r.erro;
  }

  @Post('convites/descrever')
  @Publico()
  @LimitarPorIp(30)
  @HttpCode(200)
  async descreverConvite(@Body() corpo: unknown): Promise<ConviteDescrito> {
    const r = await this.descrever.executar(validar(TokenDoConvite.esquema, corpo).token);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Post('convites/aceitar')
  @Publico()
  @LimitarPorIp(10)
  @HttpCode(204)
  async aceitarConvite(@Body() corpo: unknown): Promise<void> {
    const { token, senha } = validar(AceiteDeConvite.esquema, corpo);
    const r = await this.aceitar.executar(token, senha);
    if (!r.ok) throw r.erro;
  }
}
