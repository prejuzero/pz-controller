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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  AlterarCobertura,
  AtualizarCliente,
  AtualizarProcesso,
  CadastrarCliente,
  CadastrarProcesso,
  ConsultarCliente,
  ConsultarProcesso,
  ListarClientes,
  ListarProcessos,
  RemoverCliente,
} from '@pz/cadastro';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { AutorNoTenant, ClienteListado, Pagina, ProcessoListado } from '@pz/cadastro';
import type { Uuid } from '@pz/kernel';

function autorDe(requisicao: RequisicaoAutenticada): AutorNoTenant {
  const { sessao } = autenticacao(requisicao);
  return {
    tenantId: sessao.tenantId,
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
  };
}

const Id = z.uuid();
const idDe = (id: string) => validar(Id, id) as Uuid;

/** Contratos de processos e clientes (HU12); a regra fica no módulo cadastro. */
@Controller('v1')
export class ProcessosController {
  constructor(
    @Inject(ListarProcessos) private readonly listarProcessos: ListarProcessos<unknown>,
    @Inject(ConsultarProcesso) private readonly consultarProcesso: ConsultarProcesso<unknown>,
    @Inject(CadastrarProcesso) private readonly cadastrarProcesso: CadastrarProcesso<unknown>,
    @Inject(AtualizarProcesso) private readonly atualizarProcesso: AtualizarProcesso<unknown>,
    @Inject(AlterarCobertura) private readonly alterarCobertura: AlterarCobertura<unknown>,
    @Inject(ListarClientes) private readonly listarClientes: ListarClientes<unknown>,
    @Inject(ConsultarCliente) private readonly consultarCliente: ConsultarCliente<unknown>,
    @Inject(CadastrarCliente) private readonly cadastrarCliente: CadastrarCliente<unknown>,
    @Inject(AtualizarCliente) private readonly atualizarCliente: AtualizarCliente<unknown>,
    @Inject(RemoverCliente) private readonly removerCliente: RemoverCliente<unknown>,
  ) {}

  @Get('processos')
  @RequerPermissao('processos:ler')
  async processos(@Query() consulta: unknown): Promise<Pagina<ProcessoListado>> {
    const r = await this.listarProcessos.executar(consulta);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Get('processos/:id')
  @RequerPermissao('processos:ler')
  async processo(@Param('id') id: string): Promise<ProcessoListado> {
    const r = await this.consultarProcesso.executar(idDe(id));
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Post('processos')
  @RequerPermissao('processos:gerir')
  @HttpCode(201)
  async cadastrar(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<ProcessoListado> {
    const r = await this.cadastrarProcesso.executar(autorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Patch('processos/:id')
  @RequerPermissao('processos:gerir')
  async atualizar(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<ProcessoListado> {
    const r = await this.atualizarProcesso.executar(autorDe(requisicao), idDe(id), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Put('processos/:id/cobertura')
  @RequerPermissao('processos:gerir')
  async cobertura(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<ProcessoListado> {
    const r = await this.alterarCobertura.executar(autorDe(requisicao), idDe(id), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Get('clientes')
  @RequerPermissao('processos:ler')
  async clientes(@Query() consulta: unknown): Promise<Pagina<ClienteListado>> {
    const r = await this.listarClientes.executar(consulta);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Get('clientes/:id')
  @RequerPermissao('processos:ler')
  async cliente(@Param('id') id: string): Promise<ClienteListado> {
    const r = await this.consultarCliente.executar(idDe(id));
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Post('clientes')
  @RequerPermissao('processos:gerir')
  @HttpCode(201)
  async novoCliente(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<ClienteListado> {
    const r = await this.cadastrarCliente.executar(autorDe(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Patch('clientes/:id')
  @RequerPermissao('processos:gerir')
  async alterarCliente(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<ClienteListado> {
    const r = await this.atualizarCliente.executar(autorDe(requisicao), idDe(id), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Delete('clientes/:id')
  @RequerPermissao('processos:gerir')
  @HttpCode(204)
  async apagarCliente(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const r = await this.removerCliente.executar(autorDe(requisicao), idDe(id));
    if (!r.ok) throw r.erro;
  }
}
