import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import {
  AprovarVersaoDaTabela,
  CadastrarTipoDeAto,
  ConsultarTabelaDePrazos,
  ProporVersaoDaTabela,
  RAMOS,
} from '@pz/prazos';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { TipoDeAto, TiposDeAto, VersaoDaTabela, VersoesDaTabela } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';
import type { CuradorEmAcao } from '@pz/prazos';

/** Quem age: token de dispositivo é app (o tipo exato do cliente entra com a HU49). */
function curadorDe(requisicao: RequisicaoAutenticada): CuradorEmAcao {
  const { sessao } = autenticacao(requisicao);
  return {
    tenantId: sessao.tenantId,
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
  };
}

const Id = z.uuid();
const idDe = (id: string) => validar(Id, id) as Uuid;
const Filtro = z.object({ tipoAto: z.string().max(80).optional(), ramo: z.enum(RAMOS).optional() });

/** Contratos da tabela de prazos (HU15); a regra fica no módulo prazos. */
@Controller('v1/admin/tabela-prazos')
export class TabelaPrazosController {
  constructor(
    @Inject(CadastrarTipoDeAto) private readonly cadastrarTipo: CadastrarTipoDeAto<unknown>,
    @Inject(ProporVersaoDaTabela) private readonly propor: ProporVersaoDaTabela<unknown>,
    @Inject(AprovarVersaoDaTabela) private readonly aprovar: AprovarVersaoDaTabela<unknown>,
    @Inject(ConsultarTabelaDePrazos) private readonly consultar: ConsultarTabelaDePrazos<unknown>,
  ) {}

  @Get('tipos-de-ato')
  @RequerPermissao('curadoria:tabela-prazos')
  async listarTipos(): Promise<TiposDeAto> {
    const tipos = await this.consultar.tiposDeAto();
    return { itens: tipos.map((t) => ({ ...t, sinonimos: [...t.sinonimos] })) };
  }

  @Post('tipos-de-ato')
  @RequerPermissao('curadoria:tabela-prazos')
  @HttpCode(201)
  async cadastrarTipoDeAto(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<TipoDeAto> {
    const r = await this.cadastrarTipo.executar(curadorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    const tipos = await this.consultar.tiposDeAto();
    const tipo = tipos.find((t) => t.codigo === r.valor);
    if (tipo === undefined) throw new Error('Tipo de ato cadastrado e não encontrado');
    return { ...tipo, sinonimos: [...tipo.sinonimos] };
  }

  @Get()
  @RequerPermissao('curadoria:tabela-prazos')
  async listarVersoes(@Query() consulta: unknown): Promise<VersoesDaTabela> {
    const filtro = validar(Filtro, consulta);
    return {
      itens: (await this.consultar.versoes({
        ...(filtro.tipoAto === undefined ? {} : { tipoAto: filtro.tipoAto }),
        ...(filtro.ramo === undefined ? {} : { ramo: filtro.ramo }),
      })) as VersaoDaTabela[],
    };
  }

  @Post()
  @RequerPermissao('curadoria:tabela-prazos')
  @HttpCode(201)
  async proporVersao(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<VersaoDaTabela> {
    const r = await this.propor.executar(curadorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor as VersaoDaTabela;
  }

  @Post(':id/aprovar')
  @RequerPermissao('curadoria:tabela-prazos')
  @HttpCode(200)
  async aprovarVersao(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<VersaoDaTabela> {
    const r = await this.aprovar.executar(curadorDe(requisicao), idDe(id));
    if (!r.ok) throw r.erro;
    return r.valor as VersaoDaTabela;
  }
}
