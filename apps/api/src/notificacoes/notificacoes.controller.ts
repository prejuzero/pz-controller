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
import {
  ConcederConsentimento,
  ConsultarAvisosDeEntrega,
  DesativarDestinoPush,
  ListarConsentimentos,
  RegistrarDestinoPush,
  RevogarConsentimento,
} from '@pz/notificacoes';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { Uuid } from '@pz/kernel';
import type { AutorDoConsentimento, AvisosDeEntrega, ConsentimentoListado } from '@pz/notificacoes';

function autorDe(requisicao: RequisicaoAutenticada): AutorDoConsentimento {
  const { sessao } = autenticacao(requisicao);
  const { tenantId, usuarioId, dispositivoId } = sessao;
  return dispositivoId === undefined
    ? { tenantId, usuarioId, origem: 'portal' }
    : { tenantId, usuarioId, origem: 'app', dispositivoId };
}

const Id = z.uuid();

/** Avisos de entrega, consentimentos e push (HU30); a regra fica no módulo notificacoes. */
@Controller('v1/notificacoes')
export class NotificacoesController {
  constructor(
    @Inject(ConsultarAvisosDeEntrega)
    private readonly avisos: ConsultarAvisosDeEntrega<unknown>,
    @Inject(ListarConsentimentos) private readonly listar: ListarConsentimentos<unknown>,
    @Inject(ConcederConsentimento) private readonly conceder: ConcederConsentimento<unknown>,
    @Inject(RevogarConsentimento) private readonly revogar: RevogarConsentimento<unknown>,
    @Inject(RegistrarDestinoPush) private readonly registrarPush: RegistrarDestinoPush<unknown>,
    @Inject(DesativarDestinoPush) private readonly desativarPush: DesativarDestinoPush<unknown>,
  ) {}

  @Get('avisos')
  @RequerPermissao('conta:gerir')
  consultarAvisos(@Req() requisicao: RequisicaoAutenticada): Promise<AvisosDeEntrega> {
    const { sessao, permissoes } = autenticacao(requisicao);
    return this.avisos.executar(sessao.usuarioId, permissoes.has('usuarios:gerir'));
  }

  @Get('consentimentos')
  @RequerPermissao('conta:gerir')
  async listarConsentimentos(
    @Req() requisicao: RequisicaoAutenticada,
  ): Promise<{ itens: ConsentimentoListado[] }> {
    return { itens: await this.listar.executar(autorDe(requisicao).usuarioId) };
  }

  @Post('consentimentos')
  @RequerPermissao('conta:gerir')
  @HttpCode(201)
  async concederConsentimento(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<ConsentimentoListado> {
    const r = await this.conceder.executar(autorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Delete('consentimentos/:id')
  @RequerPermissao('conta:gerir')
  @HttpCode(204)
  async revogarConsentimento(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const r = await this.revogar.executar(autorDe(requisicao), validar(Id, id) as Uuid);
    if (!r.ok) throw r.erro;
  }

  @Put('destino-push')
  @RequerPermissao('conta:gerir')
  async registrarDestinoPush(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<{ id: string; dispositivoId: string }> {
    const r = await this.registrarPush.executar(autorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Delete('destino-push')
  @RequerPermissao('conta:gerir')
  @HttpCode(204)
  desativarDestinoPush(@Req() requisicao: RequisicaoAutenticada): Promise<void> {
    return this.desativarPush.executar(autorDe(requisicao));
  }
}
