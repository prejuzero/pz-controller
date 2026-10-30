import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ContarProcessos } from '@pz/cadastro';
import { FiltroDoDashboard } from '@pz/contracts';
import { PainelDosPrazos } from '@pz/prazos';
import { ContarPublicacoesNovas } from '@pz/publicacoes';

import { validar } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';

import type { LinhaDoTempo, ProximosPrazos, ResumoDoDashboard } from '@pz/contracts';

/**
 * Dashboard do escritório (HU26). Só compõe os contadores de cada módulo (prazos, publicações e
 * cadastro); a regra de cada contagem fica no módulo dono.
 */
@Controller('v1/dashboard')
export class DashboardController {
  constructor(
    @Inject(PainelDosPrazos) private readonly painel: PainelDosPrazos<unknown>,
    @Inject(ContarPublicacoesNovas) private readonly publicacoes: ContarPublicacoesNovas<unknown>,
    @Inject(ContarProcessos) private readonly processos: ContarProcessos<unknown>,
  ) {}

  @Get('resumo')
  @RequerPermissao('prazos:ler')
  async resumo(@Query() consulta: unknown): Promise<ResumoDoDashboard> {
    const filtro = validar(FiltroDoDashboard, consulta);
    const [prazos, novasPublicacoes, processosMonitorados] = await Promise.all([
      this.painel.resumo(filtro),
      this.publicacoes.executar(),
      this.processos.executar(filtro.tribunal === undefined ? {} : { tribunal: filtro.tribunal }),
    ]);
    if (!prazos.ok) throw prazos.erro;
    return { ...prazos.valor, novasPublicacoes, processosMonitorados };
  }

  @Get('linha-do-tempo')
  @RequerPermissao('prazos:ler')
  async linhaDoTempo(@Query() consulta: unknown): Promise<LinhaDoTempo> {
    const r = await this.painel.linhaDoTempo(consulta);
    if (!r.ok) throw r.erro;
    return { itens: r.valor.map((d) => ({ data: d.data.paraIso(), quantidade: d.quantidade })) };
  }

  @Get('proximos-prazos')
  @RequerPermissao('prazos:ler')
  async proximosPrazos(@Query() consulta: unknown): Promise<ProximosPrazos> {
    const r = await this.painel.proximos(consulta);
    if (!r.ok) throw r.erro;
    return { itens: r.valor };
  }
}
