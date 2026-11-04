import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { VerificarHistorico } from '@pz/auditoria';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { HISTORICO_DO_PRAZO } from '../fichas.js';
import { Publico, RequerPermissao } from '../http/acesso.js';
import { LimitarPorIp } from '../http/limite.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { historicoDoPrazo } from '../prazos/historico.js';
import type { HistoricoDoPrazo, VerificacaoDoHistorico } from '@pz/contracts';
import type { Uuid } from '@pz/kernel';

/**
 * Histórico do prazo e verificação pública do PDF (HU35). A leitura e a verificação ficam no
 * módulo auditoria; aqui só a ligação HTTP.
 */
@Controller('v1')
export class HistoricoController {
  constructor(
    @Inject(HISTORICO_DO_PRAZO) private readonly historico: ReturnType<typeof historicoDoPrazo>,
    @Inject(VerificarHistorico) private readonly verificar: VerificarHistorico<unknown>,
  ) {}

  @Get('prazos/:id/historico')
  @RequerPermissao('prazos:ler')
  consultarHistoricoDoPrazo(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<HistoricoDoPrazo> {
    return this.historico(autenticacao(requisicao).sessao.tenantId, validar(z.uuid(), id) as Uuid);
  }

  @Get('verificacoes/:codigo')
  @Publico()
  @LimitarPorIp(30)
  async verificarHistorico(@Param('codigo') codigo: string): Promise<VerificacaoDoHistorico> {
    // Código mal formado é só "inexistente" para quem verifica (o módulo nem consulta o banco).
    const r = await this.verificar.executar(codigo);
    return r.situacao === 'valido' ? { ...r, eventos: [...r.eventos] } : r;
  }
}
