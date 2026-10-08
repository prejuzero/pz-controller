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
  Query,
  Req,
} from '@nestjs/common';
import { ConsultarFilas, ConsultarIntegracoes, ReprocessarJobMorto } from '@pz/administracao';
import {
  ConsultaPaginada,
  PedidoDeAssinatura,
  PedidoDeImpersonacao,
  PedidoDeReprocessamento,
  PedidoDeSuspensao,
  Uuid as UuidContrato,
} from '@pz/contracts';
import {
  AlterarAssinatura,
  ConsultarPermissoes,
  DetalharTenant,
  EncerrarImpersonacao,
  IniciarImpersonacao,
  ListarTenants,
  ReativarTenant,
  SuspenderTenant,
} from '@pz/identidade';
import { ListarSupressoes } from '@pz/notificacoes';

import { autenticacao, contextoDe, sessaoAtual, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type {
  PaginaDeRejeicoes,
  PaginaDeTenants,
  PainelDeIntegracoes,
  ResumoDasFilas,
  SessaoAtual,
  TenantAdministrado,
} from '@pz/contracts';
import type { Administrador, TenantAdministrado as Tenant } from '@pz/identidade';
import type { Result, Uuid } from '@pz/kernel';

const ConsultaDeTenants = ConsultaPaginada.extend({ cursor: UuidContrato.optional() });

function paraContrato(t: Tenant): TenantAdministrado {
  return {
    id: t.id,
    nome: t.nome,
    tipo: t.tipo,
    plano: t.plano,
    situacaoAssinatura: t.situacaoAssinatura,
    suspensao:
      t.suspensao === undefined
        ? null
        : { em: t.suspensao.em.paraIso(), motivo: t.suspensao.motivo },
    encerradoEm: t.encerradoEm?.paraIso() ?? null,
    criadoEm: t.criadoEm.paraIso(),
  };
}

function tenantOuErro(r: Result<Tenant, Error>): TenantAdministrado {
  if (!r.ok) throw r.erro;
  return paraContrato(r.valor);
}

const idDoTenant = (id: string) => validar(UuidContrato, id) as Uuid;

function administrador(requisicao: RequisicaoAutenticada): Administrador {
  const { sessao } = autenticacao(requisicao);
  return { usuarioId: sessao.usuarioId, tenantId: sessao.tenantId, ...contextoDe(requisicao) };
}

/**
 * Contratos `iniciarImpersonacao` e `encerrarImpersonacao` (regra no módulo identidade) e
 * `reprocessarJobMorto` (regra no módulo administracao), da HU07; tenants da plataforma (HU39,
 * regra no módulo identidade).
 */
@Controller('v1/admin')
export class AdminController {
  constructor(
    @Inject(IniciarImpersonacao) private readonly iniciar: IniciarImpersonacao<unknown>,
    @Inject(EncerrarImpersonacao) private readonly encerrar: EncerrarImpersonacao<unknown>,
    @Inject(ConsultarPermissoes) private readonly consultarPermissoes: ConsultarPermissoes,
    @Inject(ReprocessarJobMorto) private readonly reprocessar: ReprocessarJobMorto<unknown>,
    @Inject(ListarTenants) private readonly listar: ListarTenants<unknown>,
    @Inject(DetalharTenant) private readonly detalhar: DetalharTenant<unknown>,
    @Inject(AlterarAssinatura) private readonly assinatura: AlterarAssinatura<unknown>,
    @Inject(SuspenderTenant) private readonly suspender: SuspenderTenant<unknown>,
    @Inject(ReativarTenant) private readonly reativar: ReativarTenant<unknown>,
    @Inject(ConsultarIntegracoes) private readonly integracoes: ConsultarIntegracoes,
    @Inject(ConsultarFilas) private readonly filas: ConsultarFilas,
    @Inject(ListarSupressoes) private readonly supressoes: ListarSupressoes<unknown>,
  ) {}

  @Get('integracoes')
  @RequerPermissao('admin:filas')
  async consultarIntegracoes(): Promise<PainelDeIntegracoes> {
    const { adaptadores, falhas } = await this.integracoes.executar();
    return {
      adaptadores: adaptadores.map((a) => ({
        adaptador: a.adaptador,
        estado: a.estado,
        instancias: a.instancias,
        ultimoSucesso: a.ultimoSucesso?.paraIso() ?? null,
        ultimaFalha: a.ultimaFalha?.paraIso() ?? null,
        erro: a.erro ?? null,
      })),
      falhas: falhas.map((f) => ({ ...f, em: f.em.paraIso() })),
    };
  }

  @Get('filas')
  @RequerPermissao('admin:filas')
  async resumirFilas(): Promise<ResumoDasFilas> {
    return { filas: await this.filas.executar() };
  }

  @Get('rejeicoes-email')
  @RequerPermissao('admin:tenants')
  async rejeicoes(@Query() consulta: unknown): Promise<PaginaDeRejeicoes> {
    const { cursor, limite } = validar(ConsultaPaginada, consulta);
    const pagina = await this.supressoes.executar({
      limite,
      ...(cursor === undefined ? {} : { apos: cursor }),
    });
    return {
      itens: pagina.itens.map((s) => ({ ...s, criadaEm: s.criadaEm.paraIso() })),
      proximoCursor: pagina.proximoCursor,
    };
  }

  @Get('tenants')
  @RequerPermissao('admin:tenants')
  async tenants(@Query() consulta: unknown): Promise<PaginaDeTenants> {
    const { cursor, limite } = validar(ConsultaDeTenants, consulta);
    const pagina = await this.listar.executar({
      limite,
      ...(cursor === undefined ? {} : { apos: cursor as Uuid }),
    });
    return { itens: pagina.itens.map(paraContrato), proximoCursor: pagina.proximoCursor };
  }

  @Get('tenants/:tenantId')
  @RequerPermissao('admin:tenants')
  async tenant(@Param('tenantId') tenantId: string): Promise<TenantAdministrado> {
    return tenantOuErro(await this.detalhar.executar(idDoTenant(tenantId)));
  }

  @Patch('tenants/:tenantId/assinatura')
  @RequerPermissao('admin:tenants')
  async alterarAssinatura(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('tenantId') tenantId: string,
    @Body() corpo: unknown,
  ): Promise<TenantAdministrado> {
    const { plano, situacaoAssinatura } = validar(PedidoDeAssinatura.esquema, corpo);
    return tenantOuErro(
      await this.assinatura.executar(administrador(requisicao), idDoTenant(tenantId), {
        ...(plano === undefined ? {} : { plano }),
        ...(situacaoAssinatura === undefined ? {} : { situacaoAssinatura }),
      }),
    );
  }

  @Post('tenants/:tenantId/suspensao')
  @RequerPermissao('admin:tenants')
  @HttpCode(200)
  async suspenderTenant(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('tenantId') tenantId: string,
    @Body() corpo: unknown,
  ): Promise<TenantAdministrado> {
    const { motivo } = validar(PedidoDeSuspensao.esquema, corpo);
    return tenantOuErro(
      await this.suspender.executar(administrador(requisicao), idDoTenant(tenantId), motivo),
    );
  }

  @Delete('tenants/:tenantId/suspensao')
  @RequerPermissao('admin:tenants')
  async reativarTenant(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('tenantId') tenantId: string,
  ): Promise<TenantAdministrado> {
    return tenantOuErro(
      await this.reativar.executar(administrador(requisicao), idDoTenant(tenantId)),
    );
  }

  @Post('impersonacao')
  @RequerPermissao('admin:impersonar')
  @HttpCode(201)
  async iniciarImpersonacao(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<SessaoAtual> {
    const { token, sessao } = autenticacao(requisicao);
    const pedido = validar(PedidoDeImpersonacao.esquema, corpo);
    const resultado = await this.iniciar.executar(
      token,
      sessao,
      { tenantId: pedido.tenantId as Uuid, motivo: pedido.motivo },
      contextoDe(requisicao),
    );
    if (!resultado.ok) throw resultado.erro;
    return sessaoAtual(resultado.valor, await this.consultarPermissoes.executar(resultado.valor));
  }

  @Delete('impersonacao')
  @RequerPermissao('admin:impersonar')
  @HttpCode(204)
  async encerrarImpersonacao(@Req() requisicao: RequisicaoAutenticada): Promise<void> {
    const { token, sessao } = autenticacao(requisicao);
    await this.encerrar.executar(token, sessao, contextoDe(requisicao));
  }

  @Post('filas/:fila/dlq/:jobId/reprocessar')
  @RequerPermissao('admin:filas')
  @HttpCode(204)
  async reprocessarJobMorto(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('fila') fila: string,
    @Param('jobId') jobId: string,
    @Body() corpo: unknown,
  ): Promise<void> {
    const { sessao } = autenticacao(requisicao);
    const { motivo } = validar(PedidoDeReprocessamento.esquema, corpo);
    const resultado = await this.reprocessar.executar({
      fila,
      jobId,
      motivo,
      usuarioId: sessao.usuarioId,
      ...contextoDe(requisicao),
    });
    if (!resultado.ok) throw resultado.erro;
  }
}
