import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ConsultarPublicacao, ListarPublicacoes, MarcarComoLida } from '@pz/publicacoes';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { PaginaDePublicacoes, PublicacaoDoTenant as Contrato } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';
import type { PublicacaoDoTenant } from '@pz/publicacoes';

const Id = z.uuid();
const idDe = (id: string) => validar(Id, id) as Uuid;

const listada = (p: PublicacaoDoTenant): Contrato => ({
  id: p.id,
  fonte: p.fonte,
  idExterno: p.idExterno,
  numeroCnj: p.numeroCnj,
  dataDisponibilizacao: p.dataDisponibilizacao,
  teor: p.teor,
  urlFonte: p.urlFonte,
  processoId: p.processoId,
  siglaTribunal: p.siglaTribunal,
  tipoComunicacao: p.tipoComunicacao,
  recebidaEm: p.recebidaEm.toISOString(),
  capturadoEm: p.capturadoEm.toISOString(),
  lidaEm: p.lidaEm?.toISOString() ?? null,
});

/** Publicações do escritório (HU18); a regra fica no módulo publicacoes. */
@Controller('v1/publicacoes')
export class PublicacoesController {
  constructor(
    @Inject(ListarPublicacoes) private readonly listar: ListarPublicacoes<unknown>,
    @Inject(ConsultarPublicacao) private readonly consultar: ConsultarPublicacao<unknown>,
    @Inject(MarcarComoLida) private readonly marcar: MarcarComoLida<unknown>,
  ) {}

  @Get()
  @RequerPermissao('publicacoes:ler')
  async listarPublicacoes(@Query() consulta: unknown): Promise<PaginaDePublicacoes> {
    const r = await this.listar.executar(consulta);
    if (!r.ok) throw r.erro;
    return { itens: r.valor.itens.map(listada), proximoCursor: r.valor.proximoCursor };
  }

  @Get(':id')
  @RequerPermissao('publicacoes:ler')
  async consultarPublicacao(@Param('id') id: string): Promise<Contrato> {
    const r = await this.consultar.executar(idDe(id));
    if (!r.ok) throw r.erro;
    return listada(r.valor);
  }

  @Post(':id/lida')
  @RequerPermissao('publicacoes:ler')
  @HttpCode(204)
  async marcarLida(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const { sessao } = autenticacao(requisicao);
    const r = await this.marcar.executar(
      { usuarioId: sessao.usuarioId, canal: sessao.dispositivoId === undefined ? 'portal' : 'app' },
      idDe(id),
    );
    if (!r.ok) throw r.erro;
  }
}
