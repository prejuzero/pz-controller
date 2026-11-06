import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  DesativarAssinatura,
  EVENTOS_PUBLICOS,
  ListarAssinaturas,
  ListarEntregas,
  NOMES_DOS_EVENTOS_PUBLICOS,
  ReenviarEntrega,
  RegistrarAssinatura,
  TestarAssinatura,
} from '@pz/webhooks';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type {
  AssinaturaDeWebhookCriada,
  AssinaturasDeWebhook,
  EntregaDeWebhook,
  EntregasDeWebhook,
  EventosDeWebhook,
} from '@pz/contracts';
import type { Uuid } from '@pz/kernel';
import type { Autor } from '@pz/webhooks';

function autor(requisicao: RequisicaoAutenticada): Autor {
  const { sessao } = autenticacao(requisicao);
  return {
    tenantId: sessao.tenantId,
    usuarioId: sessao.usuarioId,
    canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
  };
}

const Id = z.uuid();
const ConsultaDasEntregas = z.object({
  assinaturaId: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
});

/** Webhooks de saída do escritório (HU49, ADR-023); a regra fica no módulo webhooks. */
@Controller('v1/integracoes/webhooks')
@RequerPermissao('integracoes:gerir')
export class WebhooksDeSaidaController {
  constructor(
    @Inject(RegistrarAssinatura) private readonly registrar: RegistrarAssinatura<unknown>,
    @Inject(ListarAssinaturas) private readonly listar: ListarAssinaturas<unknown>,
    @Inject(DesativarAssinatura) private readonly desativar: DesativarAssinatura<unknown>,
    @Inject(TestarAssinatura) private readonly testar: TestarAssinatura<unknown>,
    @Inject(ListarEntregas) private readonly entregas: ListarEntregas<unknown>,
    @Inject(ReenviarEntrega) private readonly reenviar: ReenviarEntrega<unknown>,
  ) {}

  @Get('eventos')
  eventos(): EventosDeWebhook {
    return {
      itens: NOMES_DOS_EVENTOS_PUBLICOS.map((tipo) => ({
        tipo,
        descricao: EVENTOS_PUBLICOS[tipo].descricao,
      })),
    };
  }

  @Get()
  async assinaturas(): Promise<AssinaturasDeWebhook> {
    return { itens: await this.listar.executar() };
  }

  @Post()
  @HttpCode(201)
  async criar(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<AssinaturaDeWebhookCriada> {
    const r = await this.registrar.executar(autor(requisicao), corpo);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Delete(':id')
  @HttpCode(204)
  async desativarAssinatura(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const r = await this.desativar.executar(autor(requisicao), validar(Id, id) as Uuid);
    if (!r.ok) throw r.erro;
  }

  @Post(':id/testar')
  @HttpCode(202)
  async testarAssinatura(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<EntregaDeWebhook> {
    const r = await this.testar.executar(autor(requisicao), validar(Id, id) as Uuid);
    if (!r.ok) throw r.erro;
    return r.valor;
  }

  @Get('entregas')
  async listarEntregas(@Query() consulta: unknown): Promise<EntregasDeWebhook> {
    const filtro = validar(ConsultaDasEntregas, consulta);
    return {
      itens: await this.entregas.executar({
        ...(filtro.limite === undefined ? {} : { limite: filtro.limite }),
        ...(filtro.assinaturaId === undefined ? {} : { assinaturaId: filtro.assinaturaId as Uuid }),
      }),
    };
  }

  @Post('entregas/:id/reenviar')
  @HttpCode(204)
  async reenviarEntrega(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const r = await this.reenviar.executar(autor(requisicao), validar(Id, id) as Uuid);
    if (!r.ok) throw r.erro;
  }
}
