import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ConsultarConferencias, RegistrarConferencia } from '@pz/cadastro';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { ConferenciaDePainel, ConferenciasDoEscritorio } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

const Id = z.uuid();

/** Conferência de painel (HU36); a regra fica no módulo cadastro. */
@Controller('v1')
export class ConferenciasController {
  constructor(
    @Inject(ConsultarConferencias) private readonly consultar: ConsultarConferencias<unknown>,
    @Inject(RegistrarConferencia) private readonly registrar: RegistrarConferencia<unknown>,
  ) {}

  @Get('conferencias')
  @RequerPermissao('prazos:ler')
  async listarConferencias(): Promise<ConferenciasDoEscritorio> {
    return { itens: await this.consultar.executar() };
  }

  /** Quem responde pelas intimações registra a conferência (mesma permissão de confirmar). */
  @Post('processos/:id/conferencias')
  @RequerPermissao('prazos:confirmar')
  async registrarConferencia(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Body() corpo: unknown,
  ): Promise<ConferenciaDePainel> {
    const { sessao } = autenticacao(requisicao);
    const r = await this.registrar.executar(
      {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
      },
      validar(Id, id) as Uuid,
      corpo,
    );
    if (!r.ok) throw r.erro;
    const c = r.valor;
    return {
      id: c.id,
      processoId: c.processoId,
      usuarioId: c.usuarioId,
      realizadaEm: c.realizadaEm.paraIso(),
      resultado: c.resultado,
      observacao: c.observacao,
    };
  }
}
