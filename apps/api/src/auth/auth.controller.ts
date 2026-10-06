import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  CodigoSegundoFator,
  Credenciais,
  PedidoDeRedefinicaoDeSenha,
  PedidoDeRenovacao,
  PedidoDeTokensDeDispositivo,
  RedefinicaoDeSenha,
} from '@pz/contracts';
import {
  AtivarSegundoFator,
  Autenticar,
  ConfigurarSegundoFator,
  ConsultarAcessos,
  ElevarSessao,
  EncerrarSessao,
  ListarDispositivos,
  RedefinirSenha,
  RegistrarDispositivo,
  RenovarTokens,
  RevogarDispositivo,
  SolicitarRedefinicaoDeSenha,
  VerificarSegundoFator,
} from '@pz/identidade';
import { Validacao } from '@pz/kernel';
import { z } from 'zod';

import { PermiteSessaoParcial, Publico } from '../http/acesso.js';
import { LimitarPorIp } from '../http/limite.js';

import { cookieCsrf, cookieDeSessao, cookiesApagados } from './cookies.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type {
  DispositivosDaConta,
  TokensDeDispositivo,
  AcessosRecentes,
  ConfiguracaoSegundoFator,
  SegundoFatorAtivado,
  SessaoAtual,
} from '@pz/contracts';
import type {
  ContextoDeAcesso,
  Sessao,
  SessaoCriada,
  TokensDeDispositivo as Tokens,
} from '@pz/identidade';
import type { FastifyRequest, FastifyReply } from 'fastify';

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

function contextoDe(requisicao: FastifyRequest): ContextoDeAcesso {
  const agente = requisicao.headers['user-agent'];
  return { ip: requisicao.ip, userAgent: typeof agente === 'string' ? agente : '' };
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
    @Inject(ConsultarAcessos) private readonly consultarAcessos: ConsultarAcessos,
    @Inject(SolicitarRedefinicaoDeSenha)
    private readonly solicitarRedefinicao: SolicitarRedefinicaoDeSenha,
    @Inject(RedefinirSenha) private readonly redefinir: RedefinirSenha,
    @Inject(RegistrarDispositivo) private readonly registrarDispositivo: RegistrarDispositivo,
    @Inject(RenovarTokens) private readonly renovar: RenovarTokens,
    @Inject(ListarDispositivos) private readonly listarDispositivos: ListarDispositivos,
    @Inject(RevogarDispositivo) private readonly revogarDispositivo: RevogarDispositivo,
  ) {}

  @Post('entrar')
  @Publico()
  @LimitarPorIp(10)
  @HttpCode(200)
  async entrar(
    @Req() requisicao: FastifyRequest,
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<SessaoAtual> {
    const resultado = await this.autenticar.executar(
      validar(Credenciais.esquema, corpo),
      contextoDe(requisicao),
    );
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
    const { token, sessao } = autenticacao(requisicao);
    await this.encerrar.executar(token, sessao, contextoDe(requisicao));
    void resposta.header('set-cookie', cookiesApagados());
  }

  @Get('eu')
  @PermiteSessaoParcial()
  eu(@Req() requisicao: RequisicaoAutenticada): SessaoAtual | undefined {
    const sessao = requisicao.autenticacao?.sessao;
    return sessao === undefined ? undefined : sessaoAtual(sessao);
  }

  @Post('senha/esqueci')
  @Publico()
  @LimitarPorIp(5)
  @HttpCode(204)
  async esqueci(@Body() corpo: unknown): Promise<void> {
    await this.solicitarRedefinicao.executar(
      validar(PedidoDeRedefinicaoDeSenha.esquema, corpo).email,
    );
  }

  @Post('senha/redefinir')
  @Publico()
  @LimitarPorIp(5)
  @HttpCode(204)
  async redefinirSenha(@Body() corpo: unknown): Promise<void> {
    const { token, novaSenha } = validar(RedefinicaoDeSenha.esquema, corpo);
    const resultado = await this.redefinir.executar(token, novaSenha);
    if (!resultado.ok) throw resultado.erro;
  }

  @Post('tokens')
  @HttpCode(201)
  async emitirTokens(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<TokensDeDispositivo> {
    const { tipoCliente, nomeDispositivo } = validar(PedidoDeTokensDeDispositivo.esquema, corpo);
    const tokens = await this.registrarDispositivo.executar(autenticacao(requisicao).sessao, {
      tipoCliente,
      nome: nomeDispositivo,
    });
    void resposta.header('cache-control', 'no-store');
    return paraTokens(tokens);
  }

  @Post('tokens/renovar')
  @Publico()
  @LimitarPorIp(30)
  @HttpCode(200)
  async renovarTokens(
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<TokensDeDispositivo> {
    const resultado = await this.renovar.executar(
      validar(PedidoDeRenovacao.esquema, corpo).tokenDeRenovacao,
    );
    if (!resultado.ok) throw resultado.erro;
    void resposta.header('cache-control', 'no-store');
    return paraTokens(resultado.valor);
  }

  @Get('dispositivos')
  async dispositivos(@Req() requisicao: RequisicaoAutenticada): Promise<DispositivosDaConta> {
    const itens = await this.listarDispositivos.executar(autenticacao(requisicao).sessao);
    return {
      itens: itens.map((d) => ({
        id: d.id,
        tipoCliente: d.tipoCliente,
        nome: d.nome,
        criadoEm: d.criadoEm.paraIso(),
        ultimoUso: d.ultimoUso.paraIso(),
        revogadaEm: d.revogadaEm?.paraIso() ?? null,
      })),
    };
  }

  @Delete('dispositivos/:id')
  @HttpCode(204)
  async revogar(@Req() requisicao: RequisicaoAutenticada, @Param('id') id: string): Promise<void> {
    const dispositivoId = validar(z.uuid(), id);
    const resultado = await this.revogarDispositivo.executar(
      autenticacao(requisicao).sessao,
      dispositivoId as Sessao['id'],
    );
    if (!resultado.ok) throw resultado.erro;
  }

  @Get('acessos')
  async acessos(@Req() requisicao: RequisicaoAutenticada): Promise<AcessosRecentes> {
    const itens = await this.consultarAcessos.executar(autenticacao(requisicao).sessao);
    return { itens: itens.map(paraContrato) };
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
  @LimitarPorIp(10)
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
  @LimitarPorIp(10)
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
      contextoDe(requisicao),
    );
    if (!resultado.ok) throw resultado.erro;
    const elevada = await this.elevar.executar(token, sessao);
    emitirSessao(resposta, elevada);
    return sessaoAtual(elevada.sessao);
  }
}

function paraTokens(tokens: Tokens): TokensDeDispositivo {
  return {
    dispositivoId: tokens.dispositivoId,
    tokenDeAcesso: tokens.tokenDeAcesso,
    acessoExpiraEm: tokens.acessoExpiraEm.paraIso(),
    tokenDeRenovacao: tokens.tokenDeRenovacao,
    renovacaoExpiraEm: tokens.renovacaoExpiraEm.paraIso(),
  };
}

function paraContrato(acesso: Awaited<ReturnType<ConsultarAcessos['executar']>>[number]) {
  return {
    tipo: acesso.tipo,
    sucesso: acesso.sucesso,
    ip: acesso.ip,
    userAgent: acesso.userAgent,
    ocorridoEm: acesso.ocorridoEm.paraIso(),
  };
}

function autenticacao(
  requisicao: RequisicaoAutenticada,
): NonNullable<RequisicaoAutenticada['autenticacao']> {
  // A guarda garante a autenticação em toda rota não pública.
  if (requisicao.autenticacao === undefined) throw new Error('rota protegida sem autenticação');
  return requisicao.autenticacao;
}
