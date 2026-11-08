import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  ConferirPublicacao,
  ConsultarPublicacao,
  ListarPublicacoes,
  MarcarComoLida,
} from '@pz/publicacoes';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RESUMO_DA_PUBLICACAO } from '../fichas.js';
import { RequerPermissao } from '../http/acesso.js';

import type { ResumoDaPublicacaoPorConteudo } from '../fichas.js';
import type { RequisicaoAutenticada } from '../http/acesso.js';
import type {
  PaginaDePublicacoes,
  PublicacaoDoTenant as Contrato,
  ResumoDaPublicacao,
} from '@pz/contracts';
import type { Uuid } from '@pz/kernel';
import type { PublicacaoDoTenant } from '@pz/publicacoes';

const Id = z.uuid();
const idDe = (id: string) => validar(Id, id) as Uuid;

/** Publicação do módulo para o contrato (instantes em ISO; sem ids internos de OAB e leitor). */
export const listada = (p: PublicacaoDoTenant): Contrato => ({
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
  conferencia: p.conferencia,
});

/** Publicações do escritório (HU18); a regra fica no módulo publicacoes. */
@Controller('v1/publicacoes')
export class PublicacoesController {
  constructor(
    @Inject(ListarPublicacoes) private readonly listar: ListarPublicacoes<unknown>,
    @Inject(ConsultarPublicacao) private readonly consultar: ConsultarPublicacao<unknown>,
    @Inject(MarcarComoLida) private readonly marcar: MarcarComoLida<unknown>,
    @Inject(RESUMO_DA_PUBLICACAO) private readonly resumoDe: ResumoDaPublicacaoPorConteudo,
    @Inject(ConferirPublicacao) private readonly conferir: ConferirPublicacao<unknown>,
  ) {}

  /**
   * Resumo por IA (HU62). Antes, a publicação precisa ser do escritório (404 se não for): o resumo
   * é global por conteúdo, mas só quem recebeu o conteúdo o vê.
   */
  @Get(':id/resumo')
  @RequerPermissao('publicacoes:ler')
  async consultarResumo(@Param('id') id: string): Promise<ResumoDaPublicacao> {
    const conteudoId = idDe(id);
    const publicacao = await this.consultar.executar(conteudoId);
    if (!publicacao.ok) throw publicacao.erro;
    const r = await this.resumoDe(conteudoId);
    return {
      resumo:
        r === undefined || r.texto === null
          ? null
          : {
              texto: r.texto,
              providencia: r.providencia,
              trechos: [...r.trechos],
              geradoPorIa: true,
              modelo: r.modelo,
              versaoPrompt: r.versaoPrompt,
            },
    };
  }

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

  /**
   * Conferência da capturada só pelo nome (HU42): confirmar cria o processo e segue para o
   * prazo; descartar tira das listas. Decisão humana, com trilha.
   */
  @Post(':id/conferencia')
  @RequerPermissao('processos:gerir')
  @HttpCode(204)
  async conferirPublicacao(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<void> {
    const { sessao } = autenticacao(requisicao);
    const r = await this.conferir.executar(
      {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
      },
      idDe(id),
      corpo,
    );
    if (!r.ok) throw r.erro;
  }
}
