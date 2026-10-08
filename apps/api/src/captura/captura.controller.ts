import { Controller, Get, Inject } from '@nestjs/common';
import { ConsultarStatusDaCaptura } from '@pz/captura';

import { RequerPermissao } from '../http/acesso.js';

import type { StatusDaCaptura } from '@pz/contracts';
import type { Instant } from '@pz/kernel';

const iso = (instante: Instant | null) => (instante === null ? null : instante.paraIso());

/** Status da captura (HU19); a regra fica no módulo captura. */
@Controller('v1/captura')
export class CapturaController {
  constructor(
    @Inject(ConsultarStatusDaCaptura)
    private readonly consultar: ConsultarStatusDaCaptura<unknown>,
  ) {}

  @Get('status')
  @RequerPermissao('publicacoes:ler')
  async status(): Promise<StatusDaCaptura> {
    const { fonte, oabs } = await this.consultar.executar();
    return {
      fonte: { id: fonte.id, situacao: fonte.situacao, desde: iso(fonte.desde) },
      oabs: oabs.map((o) => ({
        oabId: o.oabId,
        oab: o.oab,
        ultimoSucesso: iso(o.ultimoSucesso),
        proximaExecucao: iso(o.proximaExecucao),
        falhasConsecutivas: o.falhasConsecutivas,
      })),
    };
  }
}
