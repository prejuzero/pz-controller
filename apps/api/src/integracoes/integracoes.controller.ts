import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  PedidoDeAppOAuth,
  PedidoDeAutorizacaoOAuth,
  PedidoDeClienteDeIntegracao,
  PedidoDeRegistroOAuth,
  PedidoDeTokenOAuth,
} from '@pz/contracts';
import {
  AutorizarCliente,
  CATALOGO_DE_PERMISSOES,
  DescreverAutorizacao,
  EmitirTokenDeCliente,
  escoposOAuth,
  ListarClientesOAuth,
  RegistrarClienteDinamico,
  RegistrarClienteOAuth,
  RenovarTokens,
  RevogarClienteOAuth,
  TrocarCodigoPorTokens,
  VALIDADE_DO_ACESSO_EM_SEGUNDOS,
} from '@pz/identidade';
import { NaoAutenticado, Proibido, Validacao } from '@pz/kernel';
import { criarLogger } from '@pz/observability';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { AMBIENTE } from '../fichas.js';
import { Publico, RequerPermissao } from '../http/acesso.js';
import { LimitarPorIp } from '../http/limite.js';

import type { AmbienteApi } from '../ambiente.js';
import type { RequisicaoAutenticada } from '../http/acesso.js';
import type {
  AppOAuthCriado,
  AutorizacaoOAuthConcedida,
  ClienteDeIntegracaoCriado,
  ClientesDeIntegracao,
  DescricaoDaAutorizacaoOAuth,
  EscoposDeIntegracao,
  MetadadosOAuth,
  RegistroOAuth,
  TokenOAuth,
} from '@pz/contracts';
import type { ClienteOAuth, PedidoDeAutorizacao, TokensDeDispositivo } from '@pz/identidade';
import type { Instant, Uuid } from '@pz/kernel';
import type { FastifyReply } from 'fastify';

export const ROTA_DE_TOKEN = '/v1/oauth/token';

const logger = criarLogger('api.oauth');

/** `Authorization: Basic base64(client_id:client_secret)` (RFC 6749, seção 2.3.1). */
export function credencialBasic(
  cabecalho: string | undefined,
): { id: string; segredo: string } | undefined {
  const basic = /^Basic ([A-Za-z0-9+/=]{4,600})$/.exec(cabecalho ?? '');
  if (basic?.[1] === undefined) return undefined;
  const texto = Buffer.from(basic[1], 'base64').toString('utf8');
  const separador = texto.indexOf(':');
  if (separador < 1) return undefined;
  return {
    id: decodeURIComponent(texto.slice(0, separador)),
    segredo: decodeURIComponent(texto.slice(separador + 1)),
  };
}

const iso = (instante: Instant | undefined) => instante?.paraIso() ?? null;

/** Escopos que um assistente pode pedir: só os de leitura do catálogo (HU49, HU60). */
const escoposDeLeitura = () =>
  escoposOAuth()
    .filter((e) => CATALOGO_DE_PERMISSOES[e.escopo].leitura)
    .map((e) => e.escopo);

function paraCliente(c: ClienteOAuth): ClientesDeIntegracao['itens'][number] {
  return {
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    redirectUris: [...c.redirectUris],
    escopos: [...c.escopos],
    criadoEm: c.criadoEm.paraIso(),
    ultimoUso: iso(c.ultimoUso),
    revogadoEm: iso(c.revogadoEm),
  };
}

function paraPedido(p: PedidoDeAutorizacaoOAuth): PedidoDeAutorizacao {
  return {
    responseType: p.response_type,
    clienteId: p.client_id as Uuid,
    redirectUri: p.redirect_uri,
    desafio: p.code_challenge,
    metodoDoDesafio: p.code_challenge_method,
    ...(p.scope === undefined ? {} : { escopo: p.scope }),
    ...(p.state === undefined ? {} : { estado: p.state }),
  };
}

function paraTokenComRenovacao(t: TokensDeDispositivo): TokenOAuth {
  return {
    access_token: t.tokenDeAcesso,
    token_type: 'Bearer',
    expires_in: VALIDADE_DO_ACESSO_EM_SEGUNDOS,
    scope: (t.escopos ?? []).join(' '),
    refresh_token: t.tokenDeRenovacao,
  };
}

/** Consentimento só pela sessão do navegador (cookie + CSRF), nunca por token de app. */
function sessaoDoPortal(requisicao: RequisicaoAutenticada) {
  const { sessao, modo } = autenticacao(requisicao);
  if (modo !== 'cookie') {
    throw new Proibido('autorizacao-so-no-portal', 'Autorize pelo portal, com sua senha.');
  }
  return sessao;
}

/**
 * API pública (HU49, ADR-015). Integrador confidencial: Client Credentials. App público:
 * Authorization Code + PKCE, com consentimento no portal e renovação rotativa. O token usa as
 * mesmas rotas `/v1` do portal, limitado aos escopos de leitura concedidos.
 */
@Controller()
export class IntegracoesController {
  constructor(
    @Inject(RegistrarClienteOAuth) private readonly registrar: RegistrarClienteOAuth,
    @Inject(ListarClientesOAuth) private readonly listar: ListarClientesOAuth,
    @Inject(RevogarClienteOAuth) private readonly revogar: RevogarClienteOAuth,
    @Inject(EmitirTokenDeCliente) private readonly emitir: EmitirTokenDeCliente,
    @Inject(DescreverAutorizacao) private readonly descrever: DescreverAutorizacao,
    @Inject(AutorizarCliente) private readonly autorizar: AutorizarCliente,
    @Inject(TrocarCodigoPorTokens) private readonly trocar: TrocarCodigoPorTokens,
    @Inject(RenovarTokens) private readonly renovar: RenovarTokens,
    @Inject(RegistrarClienteDinamico) private readonly registrarDinamico: RegistrarClienteDinamico,
    @Inject(AMBIENTE) private readonly ambiente: AmbienteApi,
  ) {}

  /**
   * Registro dinâmico (HU60, RFC 7591): público e sem acesso a nada até um advogado autorizar.
   * Limite por IP contra registros em massa.
   */
  @Post('v1/oauth/registro')
  @Publico()
  @LimitarPorIp(10)
  @HttpCode(201)
  async registrarClienteDinamico(
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<RegistroOAuth> {
    const pedido = PedidoDeRegistroOAuth.esquema.safeParse(corpo);
    if (!pedido.success) {
      throw new Validacao(
        pedido.error.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })),
        'invalid_client_metadata',
      );
    }
    const p = pedido.data;
    const r = await this.registrarDinamico.executar({
      redirectUris: p.redirect_uris,
      ...(p.client_name === undefined ? {} : { nome: p.client_name }),
      ...(p.token_endpoint_auth_method === undefined
        ? {}
        : { metodoDeAutenticacao: p.token_endpoint_auth_method }),
      ...(p.grant_types === undefined ? {} : { grants: p.grant_types }),
      ...(p.response_types === undefined ? {} : { tiposDeResposta: p.response_types }),
    });
    if (!r.ok) throw r.erro;
    void resposta.header('cache-control', 'no-store');
    return {
      client_id: r.valor.id,
      client_id_issued_at: Math.floor(r.valor.criadoEm.epochMs / 1000),
      client_name: r.valor.nome,
      redirect_uris: [...r.valor.redirectUris],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: escoposDeLeitura().join(' '),
    };
  }

  /** Metadados do servidor de autorização (RFC 8414), lidos pelo servidor MCP (HU60). */
  @Get('v1/oauth/metadados')
  @Publico()
  metadados(): MetadadosOAuth {
    const portal = this.ambiente.PORTAL_URL.replace(/\/$/, '');
    return {
      authorization_endpoint: `${portal}/oauth/autorizar`,
      token_endpoint: `${portal}${ROTA_DE_TOKEN}`,
      registration_endpoint: `${portal}/v1/oauth/registro`,
      scopes_supported: escoposDeLeitura(),
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    };
  }

  @Post(ROTA_DE_TOKEN.slice(1))
  @Publico()
  @LimitarPorIp(30)
  @HttpCode(200)
  async token(
    @Body() corpo: unknown,
    @Headers('authorization') cabecalho: string | undefined,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<TokenOAuth> {
    void resposta.header('cache-control', 'no-store').header('pragma', 'no-cache');
    const pedido = PedidoDeTokenOAuth.esquema.safeParse(corpo);
    if (!pedido.success) {
      const tipo = (corpo as { grant_type?: unknown } | null)?.grant_type;
      throw new Validacao(
        pedido.error.issues.map((p) => ({ campo: p.path.join('.'), mensagem: p.message })),
        tipo === undefined || PedidoDeTokenOAuth.esquema.shape.grant_type.safeParse(tipo).success
          ? 'invalid_request'
          : 'unsupported_grant_type',
      );
    }
    if (pedido.data.grant_type !== 'client_credentials') {
      return this.#tokenDoApp(pedido.data, cabecalho);
    }
    const basic = credencialBasic(cabecalho);
    const doCorpo = pedido.data.client_id !== undefined || pedido.data.client_secret !== undefined;
    // Um só método de autenticação do cliente por pedido (RFC 6749, seção 2.3).
    if (basic !== undefined && doCorpo) {
      throw new Validacao(
        [{ campo: 'client_id', mensagem: 'Use Basic ou o corpo, não os dois.' }],
        'invalid_request',
      );
    }
    const id = basic?.id ?? pedido.data.client_id;
    const segredo = basic?.segredo ?? pedido.data.client_secret;
    if (id === undefined || segredo === undefined) {
      throw new NaoAutenticado('invalid_client', 'Informe client_id e client_secret.');
    }
    const resultado = await this.emitir.executar({
      clienteId: id as Uuid,
      segredo,
      ...(pedido.data.scope === undefined ? {} : { escopo: pedido.data.scope }),
    });
    if (!resultado.ok) {
      // Sem o segredo no log; o id do cliente ajuda a achar integração mal configurada.
      logger.warn({ clienteId: id, codigo: resultado.erro.codigo }, 'token OAuth recusado');
      if (basic !== undefined && resultado.erro.codigo === 'invalid_client') {
        void resposta.header('www-authenticate', 'Basic realm="prejuzero"');
      }
      throw resultado.erro;
    }
    const { tokenDeAcesso, validadeEmSegundos, escopos } = resultado.valor;
    return {
      access_token: tokenDeAcesso,
      token_type: 'Bearer',
      expires_in: validadeEmSegundos,
      scope: escopos.join(' '),
    };
  }

  /** App público: sem segredo; o `client_id` vem no corpo (OAuth 2.1, seção 3.2.2). */
  async #tokenDoApp(
    pedido: PedidoDeTokenOAuth,
    cabecalho: string | undefined,
  ): Promise<TokenOAuth> {
    const clienteId = pedido.client_id;
    if (clienteId === undefined || cabecalho !== undefined || pedido.client_secret !== undefined) {
      throw new NaoAutenticado('invalid_client', 'App público: só o client_id, no corpo.');
    }
    const faltando = (campo: string) =>
      new Validacao([{ campo, mensagem: 'Obrigatório.' }], 'invalid_request');
    let resultado;
    if (pedido.grant_type === 'authorization_code') {
      const { code, redirect_uri: redirectUri, code_verifier: verificador } = pedido;
      if (code === undefined) throw faltando('code');
      if (redirectUri === undefined) throw faltando('redirect_uri');
      if (verificador === undefined) throw faltando('code_verifier');
      resultado = await this.trocar.executar({
        codigo: code,
        clienteId: clienteId as Uuid,
        redirectUri,
        verificador,
      });
    } else {
      if (pedido.refresh_token === undefined) throw faltando('refresh_token');
      const renovado = await this.renovar.executar(pedido.refresh_token, clienteId as Uuid);
      // A renovação recusada é concessão inválida para o padrão (RFC 6749, seção 5.2).
      resultado = renovado.ok
        ? renovado
        : { ok: false as const, erro: new NaoAutenticado('invalid_grant', renovado.erro.message) };
    }
    if (!resultado.ok) {
      logger.warn(
        { clienteId, grant: pedido.grant_type, codigo: resultado.erro.codigo },
        'token OAuth recusado',
      );
      throw resultado.erro;
    }
    return paraTokenComRenovacao(resultado.valor);
  }

  @Get('v1/oauth/autorizacao')
  @RequerPermissao('conta:gerir')
  async descreverAutorizacao(
    @Req() requisicao: RequisicaoAutenticada,
    @Query() consulta: unknown,
  ): Promise<DescricaoDaAutorizacaoOAuth> {
    const pedido = paraPedido(validar(PedidoDeAutorizacaoOAuth.esquema, consulta));
    const r = await this.descrever.executar(sessaoDoPortal(requisicao), pedido);
    if (!r.ok) throw r.erro;
    return { ...r.valor, escopos: [...r.valor.escopos] };
  }

  @Post('v1/oauth/autorizacao')
  @RequerPermissao('conta:gerir')
  @HttpCode(200)
  async autorizarCliente(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<AutorizacaoOAuthConcedida> {
    const pedido = paraPedido(validar(PedidoDeAutorizacaoOAuth.esquema, corpo));
    const r = await this.autorizar.executar(sessaoDoPortal(requisicao), pedido);
    if (!r.ok) throw r.erro;
    void resposta.header('cache-control', 'no-store');
    return r.valor;
  }

  @Get('v1/integracoes/escopos')
  @RequerPermissao('integracoes:gerir')
  escopos(): EscoposDeIntegracao {
    return {
      itens: escoposOAuth().filter((e) => CATALOGO_DE_PERMISSOES[e.escopo].leitura),
    };
  }

  @Get('v1/integracoes/clientes')
  @RequerPermissao('integracoes:gerir')
  async clientes(): Promise<ClientesDeIntegracao> {
    return { itens: (await this.listar.executar()).map(paraCliente) };
  }

  @Post('v1/integracoes/clientes')
  @RequerPermissao('integracoes:gerir')
  @HttpCode(201)
  async registrarCliente(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
    @Res({ passthrough: true }) resposta: FastifyReply,
  ): Promise<ClienteDeIntegracaoCriado> {
    const pedido = validar(PedidoDeClienteDeIntegracao.esquema, corpo);
    const resultado = await this.registrar.executar(autenticacao(requisicao).sessao, pedido);
    if (!resultado.ok) throw resultado.erro;
    const { cliente, segredo } = resultado.valor;
    if (segredo === null) throw new Error('cliente confidencial registrado sem segredo');
    void resposta.header('cache-control', 'no-store');
    return { cliente: paraCliente(cliente), segredo };
  }

  @Post('v1/integracoes/apps')
  @RequerPermissao('integracoes:gerir')
  @HttpCode(201)
  async registrarApp(
    @Req() requisicao: RequisicaoAutenticada,
    @Body() corpo: unknown,
  ): Promise<AppOAuthCriado> {
    const pedido = validar(PedidoDeAppOAuth.esquema, corpo);
    const resultado = await this.registrar.executar(autenticacao(requisicao).sessao, {
      ...pedido,
      tipo: 'publico',
    });
    if (!resultado.ok) throw resultado.erro;
    return { cliente: paraCliente(resultado.valor.cliente) };
  }

  @Delete('v1/integracoes/clientes/:id')
  @RequerPermissao('integracoes:gerir')
  @HttpCode(204)
  async revogarCliente(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<void> {
    const resultado = await this.revogar.executar(
      autenticacao(requisicao).sessao,
      validar(z.uuid(), id) as Uuid,
    );
    if (!resultado.ok) throw resultado.erro;
  }
}
