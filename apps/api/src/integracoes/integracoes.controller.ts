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
  Req,
  Res,
} from '@nestjs/common';
import { PedidoDeClienteDeIntegracao, PedidoDeTokenOAuth } from '@pz/contracts';
import {
  CATALOGO_DE_PERMISSOES,
  EmitirTokenDeCliente,
  escoposOAuth,
  ListarClientesOAuth,
  RegistrarClienteOAuth,
  RevogarClienteOAuth,
} from '@pz/identidade';
import { NaoAutenticado, Validacao } from '@pz/kernel';
import { criarLogger } from '@pz/observability';
import { z } from 'zod';

import { autenticacao, validar } from '../auth/auth.controller.js';
import { Publico, RequerPermissao } from '../http/acesso.js';
import { LimitarPorIp } from '../http/limite.js';

import type { RequisicaoAutenticada } from '../http/acesso.js';
import type {
  ClienteDeIntegracaoCriado,
  ClientesDeIntegracao,
  EscoposDeIntegracao,
  TokenOAuth,
} from '@pz/contracts';
import type { ClienteOAuth } from '@pz/identidade';
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

function paraCliente(c: ClienteOAuth): ClientesDeIntegracao['itens'][number] {
  return {
    id: c.id,
    nome: c.nome,
    escopos: [...c.escopos],
    criadoEm: c.criadoEm.paraIso(),
    ultimoUso: iso(c.ultimoUso),
    revogadoEm: iso(c.revogadoEm),
  };
}

/**
 * API pública para integradores (HU49, ADR-015): o escritório registra clientes OAuth e eles
 * trocam id e segredo por um token curto (Client Credentials). O token usa as mesmas rotas `/v1`
 * do portal, limitado aos escopos de leitura do cliente.
 */
@Controller()
export class IntegracoesController {
  constructor(
    @Inject(RegistrarClienteOAuth) private readonly registrar: RegistrarClienteOAuth,
    @Inject(ListarClientesOAuth) private readonly listar: ListarClientesOAuth,
    @Inject(RevogarClienteOAuth) private readonly revogar: RevogarClienteOAuth,
    @Inject(EmitirTokenDeCliente) private readonly emitir: EmitirTokenDeCliente,
  ) {}

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
        tipo === undefined || tipo === 'client_credentials'
          ? 'invalid_request'
          : 'unsupported_grant_type',
      );
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
    void resposta.header('cache-control', 'no-store');
    return { cliente: paraCliente(resultado.valor.cliente), segredo: resultado.valor.segredo };
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
