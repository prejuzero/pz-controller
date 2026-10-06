import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { CodigoSegundoFator, Credenciais } from '@pz/contracts';
import {
  AtivarSegundoFator,
  Autenticar,
  ConfigurarSegundoFator,
  ElevarSessao,
  EncerrarSessao,
  VerificarSegundoFator,
} from '@pz/identidade';
import { Validacao } from '@pz/kernel';

import { PermiteSessaoParcial, Publico } from '../http/acesso.js';

import { cookieCsrf, cookieDeSessao, cookiesApagados } from './cookies.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type { ConfiguracaoSegundoFator, SegundoFatorAtivado, SessaoAtual } from '@pz/contracts';
import type { Sessao, SessaoCriada } from '@pz/identidade';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

function sessaoAtual(sessao: Sessao): SessaoAtual {
  const proximoPasso =
    sessao.nivel === 'completo'
      ? null
      : sessao.segundoFatorAtivo
        ? 'verificar-2fa'
        : 'configurar-2fa';
  return {
    usuarioId: sessao.usuarioId,
    tenantId: sessao.tenantId,
    nivel: sessao.nivel,
    proximoPasso,
  };
}

function validar<Saida>(esquema: z.ZodType<Saida>, corpo: unknown): Saida {
  const resultado = esquema.safeParse(corpo);
  if (resultado.success) return resultado.data;
  throw new Validacao(
    resultado.error.issues.map((p) => ({
      campo: p.path.join('.') || '(raiz)',
      mensagem: p.message,
    })),
  );
}

/** Grava a sessão nova nos cookies do navegador (o token Bearer de apps entra com a PZ-243). */
function emitirSessao(resposta: FastifyReply, criada: SessaoCriada): void {
  void resposta.header('set-cookie', [cookieDeSessao(criada.token), cookieCsrf()]);
  void resposta.header('cache-control', 'no-store');
}

/** Contratos `entrar`, `sair` e `consultarSessao` (HU06). Só traduz HTTP; regra no módulo. */
@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(Autenticar) private readonly autenticar: Autenticar,
    @Inject(EncerrarSessao) private readonly encerrar: EncerrarSessao,
    @Inject(ConfigurarSegundoFator) private readonly configurar: ConfigurarSegundoFator,
    @Inject(AtivarSegundoFator) private readonly ativar: AtivarSegundoFator,
    @Inject(VerificarSegundoFator) private readonly verificar: VerificarSegundoFator,
    @Inject(ElevarSessao) private readonly elevar: ElevarSessao,
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

  @Post('2fa/configurar')
  @PermiteSessaoParcial()
  @HttpCode(200)
  async configurarSegundoFator(
    @Req() requisicao: RequisicaoAutenticada,
  ): Promise<ConfiguracaoSegundoFator> {
    const resultado = await this.configurar.executar(autenticacao(requisicao).sessao);
    if (!resultado.ok) throw resultado.erro;
    return resultado.valor;
  }

  @Post('2fa/ativar')
  @PermiteSessaoParcial()
  @HttpCode(200)
  async ativarSegundoFator(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<SegundoFatorAtivado> {
    const { token, sessao } = autenticacao(requisicao);
    const resultado = await this.ativar.executar(
      sessao,
      validar(CodigoSegundoFator.esquema, corpo).codigo,
    );
    if (!resultado.ok) throw resultado.erro;
    const elevada = await this.elevar.executar(token, sessao);
    emitirSessao(resposta, elevada);
    return {
      sessao: sessaoAtual(elevada.sessao),
      codigosDeRecuperacao: resultado.valor.codigosDeRecuperacao,
    };
  }

  @Post('2fa/verificar')
  @PermiteSessaoParcial()
  @HttpCode(200)
  async verificarSegundoFator(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<SessaoAtual> {
    const { token, sessao } = autenticacao(requisicao);
    const resultado = await this.verificar.executar(
      sessao,
      validar(CodigoSegundoFator.esquema, corpo).codigo,
    );
    if (!resultado.ok) throw resultado.erro;
    const elevada = await this.elevar.executar(token, sessao);
    emitirSessao(resposta, elevada);
    return sessaoAtual(elevada.sessao);
  }
}

function autenticacao(
  requisicao: RequisicaoAutenticada,
): NonNullable<RequisicaoAutenticada['autenticacao']> {
  // A guarda garante a autenticação em toda rota não pública.
  if (requisicao.autenticacao === undefined) throw new Error('rota protegida sem autenticação');
  return requisicao.autenticacao;
}
