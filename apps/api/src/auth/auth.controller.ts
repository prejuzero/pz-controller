import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Credenciais } from '@pz/contracts';
import { Autenticar, EncerrarSessao } from '@pz/identidade';
import { Validacao } from '@pz/kernel';

import { PermiteSessaoParcial, Publico } from '../http/acesso.js';

import { cookieCsrf, cookieDeSessao, cookiesApagados } from './cookies.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { SessaoAtual } from '@pz/contracts';
import type { Sessao } from '@pz/identidade';
import type { FastifyReply } from 'fastify';

function sessaoAtual(sessao: Sessao): SessaoAtual {
  return { usuarioId: sessao.usuarioId, tenantId: sessao.tenantId, nivel: sessao.nivel };
}

/** Contratos `entrar`, `sair` e `consultarSessao` (HU06). Só traduz HTTP; regra no módulo. */
@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(Autenticar) private readonly autenticar: Autenticar,
    @Inject(EncerrarSessao) private readonly encerrar: EncerrarSessao,
  ) {}

  @Post('entrar')
  @Publico()
  @HttpCode(200)
  async entrar(
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<SessaoAtual> {
    const credenciais = Credenciais.esquema.safeParse(corpo);
    if (!credenciais.success) {
      throw new Validacao(
        credenciais.error.issues.map((p) => ({
          campo: p.path.join('.') || '(raiz)',
          mensagem: p.message,
        })),
      );
    }
    const resultado = await this.autenticar.executar(credenciais.data);
    if (!resultado.ok) throw resultado.erro;
    void resposta.header('set-cookie', [cookieDeSessao(resultado.valor.token), cookieCsrf()]);
    void resposta.header('cache-control', 'no-store');
    return sessaoAtual(resultado.valor.sessao);
  }

  @Post('sair')
  @PermiteSessaoParcial()
  @HttpCode(204)
  async sair(
    @Req() requisicao: RequisicaoAutenticada,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<void> {
    if (requisicao.autenticacao !== undefined)
      await this.encerrar.executar(requisicao.autenticacao.token);
    void resposta.header('set-cookie', cookiesApagados());
  }

  @Get('eu')
  @PermiteSessaoParcial()
  eu(@Req() requisicao: RequisicaoAutenticada): SessaoAtual | undefined {
    const sessao = requisicao.autenticacao?.sessao;
    return sessao === undefined ? undefined : sessaoAtual(sessao);
  }
}
