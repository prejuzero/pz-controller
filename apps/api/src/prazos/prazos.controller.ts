import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  AjustarPrazo,
  CancelarPrazo,
  ConfirmarPrazo,
  ConsultarPrazo,
  CumprirPrazo,
  ListarPrazos,
} from '@pz/prazos';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { DetalheDoPrazo, PaginaDePrazos, Prazo } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';
import type { AutorNoPrazo } from '@pz/prazos';

const Id = z.uuid();
const idDe = (id: string) => validar(Id, id) as Uuid;

function autor(requisicao: RequisicaoAutenticada): AutorNoPrazo {
  const { sessao } = autenticacao(requisicao);
  return {
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
  };
}

/** Prazos do escritório (HU24); a regra fica no módulo prazos e as datas, no motor. */
@Controller('v1/prazos')
export class PrazosController {
  constructor(
    @Inject(ListarPrazos) private readonly listar: ListarPrazos<unknown>,
    @Inject(ConsultarPrazo) private readonly consultar: ConsultarPrazo<unknown>,
    @Inject(ConfirmarPrazo) private readonly confirmar: ConfirmarPrazo<unknown>,
    @Inject(AjustarPrazo) private readonly ajustar: AjustarPrazo<unknown>,
    @Inject(CumprirPrazo) private readonly cumprir: CumprirPrazo<unknown>,
    @Inject(CancelarPrazo) private readonly cancelar: CancelarPrazo<unknown>,
  ) {}

  @Get()
  @RequerPermissao('prazos:ler')
  async listarPrazos(@Query() consulta: unknown): Promise<PaginaDePrazos> {
    const r = await this.listar.executar(consulta);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Get(':id')
  @RequerPermissao('prazos:ler')
  async consultarPrazo(@Param('id') id: string): Promise<DetalheDoPrazo> {
    const r = await this.consultar.executar(idDe(id));
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Post(':id/confirmar')
  @RequerPermissao('prazos:confirmar')
  @HttpCode(200)
  async confirmarPrazo(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<Prazo> {
    return this.#resultado(this.confirmar.executar(autor(requisicao), idDe(id), corpo));
  }

  @Post(':id/ajustar')
  @RequerPermissao('prazos:ajustar')
  @HttpCode(200)
  async ajustarPrazo(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<Prazo> {
    return this.#resultado(this.ajustar.executar(autor(requisicao), idDe(id), corpo));
  }

  @Post(':id/simular-ajuste')
  @RequerPermissao('prazos:ajustar')
  @HttpCode(200)
  async simularAjustePrazo(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<Prazo> {
    return this.#resultado(this.ajustar.simular(autor(requisicao), idDe(id), corpo));
  }

  @Post(':id/cumprir')
  @RequerPermissao('prazos:confirmar')
  @HttpCode(200)
  async cumprirPrazo(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<Prazo> {
    return this.#resultado(this.cumprir.executar(autor(requisicao), idDe(id), corpo));
  }

  @Post(':id/cancelar')
  @RequerPermissao('prazos:ajustar')
  @HttpCode(200)
  async cancelarPrazo(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<Prazo> {
    return this.#resultado(this.cancelar.executar(autor(requisicao), idDe(id), corpo));
  }

  async #resultado(
    resultado: Promise<{ ok: true; valor: unknown } | { ok: false; erro: Error }>,
  ): Promise<Prazo> {
    const r = await resultado;
    if (!r.ok) throw r.erro;
    return r.valor as Prazo;
  }
}
