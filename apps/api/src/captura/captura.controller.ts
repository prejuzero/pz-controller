import { Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ConsultarStatusDaCaptura, SolicitarBuscaAgora } from '@pz/captura';

import { autenticacao } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { BuscaAgoraSolicitada, StatusDaCaptura } from '@pz/contracts';
import type { Instant } from '@pz/kernel';

const iso = (instante: Instant | null) => (instante === null ? null : instante.paraIso());

/** Status da captura (HU19) e "buscar agora" (HU17); a regra fica no módulo captura. */
@Controller('v1/captura')
export class CapturaController {
  constructor(
    @Inject(ConsultarStatusDaCaptura)
    private readonly consultar: ConsultarStatusDaCaptura<unknown>,
    @Inject(SolicitarBuscaAgora)
    private readonly solicitar: SolicitarBuscaAgora<unknown>,
  ) {}

  @Get('status')
  @RequerPermissao('publicacoes:ler')
  async status(): Promise<StatusDaCaptura> {
    const { fonte, oabs } = await this.consultar.executar();
    return {
      fonte: {
        id: fonte.id,
        situacao: fonte.situacao,
        desde: iso(fonte.desde),
        proximaRodada: iso(fonte.proximaRodada),
      },
      oabs: oabs.map((o) => ({
        oabId: o.oabId,
        oab: o.oab,
        ultimoSucesso: iso(o.ultimoSucesso),
        proximaExecucao: iso(o.proximaExecucao),
        falhasConsecutivas: o.falhasConsecutivas,
        buscaAgoraLiberadaEm: iso(o.buscaAgoraLiberadaEm),
      })),
    };
  }

  /** Só consulta a fonte e entrega pelo fluxo normal: quem lê as publicações pode pedir. */
  @Post('oabs/:id/buscar-agora')
  @RequerPermissao('publicacoes:ler')
  @HttpCode(202)
  async buscarAgora(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<BuscaAgoraSolicitada> {
    const { sessao } = autenticacao(requisicao);
    const r = await this.solicitar.executar(
      {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
      },
      { oabId: id },
    );
    if (!r.ok) throw r.erro;
    return { solicitadaEm: r.valor.solicitadaEm.paraIso() };
  }
}
