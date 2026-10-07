import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  AdicionarOab,
  AtualizarPerfil,
  CadastrarAdvogado,
  ConsultarPerfil,
  RemoverOab,
} from '@pz/cadastro';
import { z } from 'zod';

import { autenticacao, contextoDe, validar } from '../auth/auth.controller.js';
import { Publico, RequerPermissao } from '../http/acesso.js';
import { LimitarPorIp } from '../http/limite.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { AutorDoCadastro, PerfilListado } from '@pz/cadastro';
import type { OabDoAdvogado } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';
import type { FastifyRequest } from 'fastify';

function autorDe(requisicao: RequisicaoAutenticada): AutorDoCadastro {
  const { sessao } = autenticacao(requisicao);
  return {
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
  };
}

const Id = z.uuid();

/** Contratos do cadastro do advogado e das OABs (HU11); a regra fica no módulo cadastro. */
@Controller('v1')
export class CadastroController {
  constructor(
    @Inject(CadastrarAdvogado) private readonly cadastrar: CadastrarAdvogado<unknown>,
    @Inject(ConsultarPerfil) private readonly consultar: ConsultarPerfil<unknown>,
    @Inject(AtualizarPerfil) private readonly atualizar: AtualizarPerfil<unknown>,
    @Inject(AdicionarOab) private readonly adicionar: AdicionarOab<unknown>,
    @Inject(RemoverOab) private readonly remover: RemoverOab<unknown>,
  ) {}

  @Post('cadastro')
  @Publico()
  @LimitarPorIp(5)
  @HttpCode(201)
  async cadastrarAdvogado(
    @Req() requisicao: FastifyRequest,
    @Body() corpo: unknown,
  ): Promise<{ usuarioId: string; perfil: PerfilListado }> {
    const r = await this.cadastrar.executar(corpo, contextoDe(requisicao));
    if (!r.ok) throw r.erro;
    return { usuarioId: r.valor.usuarioId, perfil: r.valor.perfil };
  }

  @Get('perfil')
  @RequerPermissao('conta:gerir')
  async perfil(@Req() requisicao: RequisicaoAutenticada): Promise<PerfilListado> {
    const r = await this.consultar.executar(autorDe(requisicao).usuarioId);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Patch('perfil')
  @RequerPermissao('conta:gerir')
  async atualizarPerfil(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<PerfilListado> {
    const r = await this.atualizar.executar(autorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Post('oabs')
  @RequerPermissao('conta:gerir')
  @HttpCode(201)
  async adicionarOab(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<OabDoAdvogado> {
    const r = await this.adicionar.executar(autorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Delete('oabs/:id')
  @RequerPermissao('conta:gerir')
  @HttpCode(204)
  async removerOab(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const r = await this.remover.executar(autorDe(requisicao), validar(Id, id) as Uuid);
    if (!r.ok) throw r.erro;
  }
}
