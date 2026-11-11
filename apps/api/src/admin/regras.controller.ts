import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { CuradoriaDasRegras, situacoes } from '@pz/classificacao';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { VersaoDaRegra } from '@pz/classificacao';
import type { RegraDeClassificacao, RegrasDeClassificacao } from '@pz/contracts';

const Versao = z.coerce.number().int().min(1);

function curadorDe(requisicao: RequisicaoAutenticada) {
  const { sessao } = autenticacao(requisicao);
  return {
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? ('portal' as const) : ('app' as const),
  };
}

const paraContrato = (
  r: VersaoDaRegra,
  situacao: RegraDeClassificacao['situacao'],
): RegraDeClassificacao => ({
  codigo: r.codigo,
  versao: r.versao,
  tipoAto: r.tipoAto,
  padroes: [...r.padroes],
  confianca: r.confianca,
  situacao,
  propostaPor: r.propostaPor,
  ativadaPor: r.ativadaPor,
  criadaEm: r.criadaEm.paraIso(),
});

/** Curadoria das regras rápidas (PZ-313); a regra fica no módulo classificacao. */
@Controller('v1/admin/classificacoes/regras')
export class RegrasDaClassificacaoController {
  constructor(
    @Inject(CuradoriaDasRegras) private readonly curadoria: CuradoriaDasRegras<unknown>,
  ) {}

  @Get()
  @RequerPermissao('curadoria:classificacao')
  async listar(): Promise<RegrasDeClassificacao> {
    const regras = await this.curadoria.listar();
    const situacao = situacoes(regras);
    return {
      itens: regras.map((r) =>
        paraContrato(r, situacao.get(`${r.codigo}@${String(r.versao)}`) ?? 'proposta'),
      ),
    };
  }

  @Post()
  @RequerPermissao('curadoria:classificacao')
  @HttpCode(201)
  async propor(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<RegraDeClassificacao> {
    const r = await this.curadoria.propor(curadorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return paraContrato(r.valor, 'proposta');
  }

  @Post(':codigo/:versao/ativar')
  @RequerPermissao('curadoria:classificacao')
  @HttpCode(204)
  async ativar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('codigo') codigo: string,
    @Param('versao') versao: string,
  ): Promise<void> {
    const r = await this.curadoria.ativar(curadorDe(requisicao), codigo, validar(Versao, versao));
    if (!r.ok) throw r.erro;
  }

  @Post(':codigo/retirar')
  @RequerPermissao('curadoria:classificacao')
  @HttpCode(204)
  async retirar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('codigo') codigo: string,
  ): Promise<void> {
    const r = await this.curadoria.retirar(curadorDe(requisicao), codigo);
    if (!r.ok) throw r.erro;
  }
}
