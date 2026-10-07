import { Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { AceitarDocumento, ConsultarTermosPendentes, ListarAceites } from '@pz/termos';
import { z } from 'zod';

import { autenticacao, contextoDe, validar } from '../auth/auth.controller.js';
import { PermiteTermosPendentes, RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { AceitesDoUsuario, DocumentosPendentes } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

const Id = z.uuid();

/** Contratos dos termos e do aceite versionado (HU38); a regra fica no módulo termos. */
@Controller('v1/termos')
@PermiteTermosPendentes()
export class TermosController {
  constructor(
    @Inject(ConsultarTermosPendentes) private readonly pendentes: ConsultarTermosPendentes<unknown>,
    @Inject(AceitarDocumento) private readonly aceitar: AceitarDocumento<unknown>,
    @Inject(ListarAceites) private readonly listar: ListarAceites<unknown>,
  ) {}

  @Get('pendentes')
  @RequerPermissao('conta:gerir')
  async listarPendentes(@Req() requisicao: RequisicaoAutenticada): Promise<DocumentosPendentes> {
    const { sessao } = autenticacao(requisicao);
    const documentos = await this.pendentes.executar({
      tenantId: sessao.tenantId,
      usuarioId: sessao.usuarioId,
      sessaoIniciadaEm: sessao.criadaEm,
    });
    return {
      itens: documentos.map((d) => ({ ...d, publicadoEm: d.publicadoEm.paraIso() })),
    };
  }

  @Post(':id/aceitar')
  @RequerPermissao('conta:gerir')
  @HttpCode(204)
  async aceitarDocumento(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const { sessao } = autenticacao(requisicao);
    const r = await this.aceitar.executar(
      {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        sessaoIniciadaEm: sessao.criadaEm,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
      },
      validar(Id, id) as Uuid,
      contextoDe(requisicao),
    );
    if (!r.ok) throw r.erro;
  }

  @Get('aceites')
  @RequerPermissao('conta:gerir')
  async listarAceites(@Req() requisicao: RequisicaoAutenticada): Promise<AceitesDoUsuario> {
    const { sessao } = autenticacao(requisicao);
    const aceites = await this.listar.executar(sessao);
    return { itens: aceites.map((a) => ({ ...a, aceitoEm: a.aceitoEm.paraIso() })) };
  }
}
