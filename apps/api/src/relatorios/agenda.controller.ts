import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  ConsultarFeedDaAgenda,
  CriarFeedDaAgenda,
  GerarAgendaIcs,
  LerFeedDaAgenda,
  RevogarFeedDaAgenda,
} from '@pz/relatorios';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { AMBIENTE } from '../fichas.js';
import { Publico, RequerPermissao } from '../http/acesso.js';
import { LimitarPorIp } from '../http/limite.js';

import type { AmbienteApi } from '../ambiente.js';
import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { AssinaturaCriada, AssinaturaDaAgenda } from '@pz/contracts';
import type { FastifyReply } from 'fastify';

const Token = z.string().regex(/^[A-Za-z0-9_-]{20,200}$/);
const TIPO_ICS = 'text/calendar; charset=utf-8';

function usuarioDe(requisicao: RequisicaoAutenticada) {
  const { sessao } = autenticacao(requisicao);
  return {
    tenantId: sessao.tenantId,
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? ('portal' as const) : ('app' as const),
  };
}

/**
 * Agenda pessoal (HU50, RF55): .ics para baixar e feed privado que a agenda (Google, Apple,
 * Outlook) assina. O feed carrega o token na URL (as agendas não mandam cabeçalho): fica fora dos
 * traces e dos logs (CLAUDE.md, seção 3). Sem regra aqui.
 */
@Controller('v1/agenda')
export class AgendaPessoalController {
  constructor(
    @Inject(ConsultarFeedDaAgenda) private readonly consultar: ConsultarFeedDaAgenda<unknown>,
    @Inject(CriarFeedDaAgenda) private readonly criar: CriarFeedDaAgenda<unknown>,
    @Inject(RevogarFeedDaAgenda) private readonly revogar: RevogarFeedDaAgenda<unknown>,
    @Inject(GerarAgendaIcs) private readonly gerar: GerarAgendaIcs,
    @Inject(LerFeedDaAgenda) private readonly ler: LerFeedDaAgenda<unknown>,
    @Inject(AMBIENTE) private readonly ambiente: AmbienteApi,
  ) {}

  @Get('assinatura')
  @RequerPermissao('prazos:ler')
  async assinatura(@Req() requisicao: RequisicaoAutenticada): Promise<AssinaturaDaAgenda> {
    const feed = await this.consultar.executar(usuarioDe(requisicao).usuarioId);
    return {
      ativa: feed !== undefined,
      criadaEm: feed?.criadoEm.paraIso() ?? null,
      ultimoAcesso: feed?.ultimoAcesso?.paraIso() ?? null,
    };
  }

  @Post('assinatura')
  @RequerPermissao('prazos:ler')
  @HttpCode(201)
  async assinar(
    @Req() requisicao: RequisicaoAutenticada,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<AssinaturaCriada> {
    const { token, feed } = await this.criar.executar(usuarioDe(requisicao));
    void resposta.header('cache-control', 'no-store');
    const url = `${this.ambiente.PORTAL_URL.replace(/\/$/, '')}/v1/agenda/feed/${token}`;
    return {
      url,
      webcal: url.replace(/^https?:\/\//, 'webcal://'),
      criadaEm: feed.criadoEm.paraIso(),
    };
  }

  @Delete('assinatura')
  @RequerPermissao('prazos:ler')
  @HttpCode(204)
  async revogarAssinatura(@Req() requisicao: RequisicaoAutenticada): Promise<void> {
    const r = await this.revogar.executar(usuarioDe(requisicao));
    if (!r.ok) throw r.erro;
  }

  @Get('prazos.ics')
  @RequerPermissao('prazos:ler')
  async baixar(
    @Req() requisicao: RequisicaoAutenticada,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<string> {
    const ics = await this.gerar.executar(usuarioDe(requisicao));
    void resposta
      .header('content-type', TIPO_ICS)
      .header('content-disposition', 'attachment; filename="prazos-prejuzero.ics"')
      .header('cache-control', 'no-store');
    return ics;
  }

  @Get('feed/:token')
  @Publico()
  @LimitarPorIp(30)
  async feed(
    @Param('token') token: string,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<string> {
    const r = await this.ler.executar(validar(Token, token));
    if (!r.ok) throw r.erro;
    void resposta
      .header('content-type', TIPO_ICS)
      .header('cache-control', 'private, max-age=300')
      .header('referrer-policy', 'no-referrer');
    return r.valor;
  }
}
