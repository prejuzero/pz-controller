import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { AnalisarTexto } from '@pz/classificacao';
import { AgendarCompromisso, CancelarCompromisso, ListarCompromissos } from '@pz/prazos';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { AnaliseDoTexto, Compromisso, Compromissos } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';
import type { AutorDoCadastro } from '@pz/prazos';

function autor(requisicao: RequisicaoAutenticada): AutorDoCadastro {
  const { sessao } = autenticacao(requisicao);
  return {
    tenantId: sessao.tenantId,
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
  };
}

/** Compromissos do escritório (HU25); a regra fica no módulo prazos. */
@Controller('v1/compromissos')
export class CompromissosController {
  constructor(
    @Inject(ListarCompromissos) private readonly listar: ListarCompromissos<unknown>,
    @Inject(AgendarCompromisso) private readonly agendar: AgendarCompromisso<unknown>,
    @Inject(CancelarCompromisso) private readonly cancelar: CancelarCompromisso<unknown>,
  ) {}

  @Get()
  @RequerPermissao('prazos:ler')
  async listarCompromissos(@Query() consulta: unknown): Promise<Compromissos> {
    const r = await this.listar.executar(consulta);
    if (!r.ok) throw r.erro;
    return { itens: r.valor };
  }

  @Post()
  @RequerPermissao('prazos:confirmar')
  @HttpCode(201)
  async agendarCompromisso(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<Compromisso> {
    const r = await this.agendar.executar(autor(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Post(':id/cancelar')
  @RequerPermissao('prazos:ajustar')
  @HttpCode(200)
  async cancelarCompromisso(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<Compromisso> {
    const r = await this.cancelar.executar(autor(requisicao), validar(z.uuid(), id) as Uuid, corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }
}

const PedidoDeAnalise = z.object({ texto: z.string().trim().min(1).max(50_000) }).strict();

/** Cadastro assistido (HU25): sugere ato e prazo citado do texto colado; nada é gravado. */
@Controller('v1/assistente')
export class AssistenteController {
  constructor(@Inject(AnalisarTexto) private readonly analisar: AnalisarTexto<unknown>) {}

  @Post('analisar')
  @RequerPermissao('prazos:ler')
  @HttpCode(200)
  async analisarTexto(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<AnaliseDoTexto> {
    const { texto } = validar(PedidoDeAnalise, corpo);
    const c = await this.analisar.executar(texto, autor(requisicao).tenantId);
    return {
      origem: c.origem,
      situacao: c.situacao,
      tipoAto: c.tipoAto,
      confianca: c.confianca,
      prazoCitado:
        c.prazoCitado === null
          ? null
          : {
              quantidade: c.prazoCitado.quantidade,
              unidade: c.prazoCitado.unidade,
              divergente: c.prazoCitado.divergente,
            },
      evidencias: c.evidencias.map((e) => ({ inicio: e.inicio, fim: e.fim, trecho: e.trecho })),
      motivo: c.motivo ?? null,
    };
  }
}
