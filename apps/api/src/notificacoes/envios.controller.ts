import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { SolicitarEnvioManual } from '@pz/notificacoes';

import { autenticacao } from '../auth/auth.controller.js';
import { RequerPermissao } from '../http/acesso.js';
import { LimitarPorUsuario } from '../http/limite.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { EnvioSolicitado } from '@pz/contracts';

/** Envios por usuário por hora: repassar trabalho, não disparar e-mails em massa (HU32). */
const ENVIOS_POR_HORA = 30;

/** Envio manual por e-mail (HU32); a regra fica no módulo notificacoes, o envio no worker. */
@Controller('v1/envios')
export class EnviosController {
  constructor(
    @Inject(SolicitarEnvioManual) private readonly solicitar: SolicitarEnvioManual<unknown>,
  ) {}

  @Post()
  // O anexo é uma exportação dos dados do escritório: mesma permissão dos relatórios.
  @RequerPermissao('relatorios:exportar')
  @LimitarPorUsuario(ENVIOS_POR_HORA, 3_600_000)
  @HttpCode(202)
  async enviarPorEmail(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<EnvioSolicitado> {
    const { sessao } = autenticacao(requisicao);
    const r = await this.solicitar.executar(
      {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        canal: sessao.dispositivoId === undefined ? 'portal' : 'app',
      },
      corpo,
    );
    if (!r.ok) throw r.erro;
    return r.valor;
  }
}
