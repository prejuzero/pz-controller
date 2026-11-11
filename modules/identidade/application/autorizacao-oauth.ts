import { err, gerarUuidV7, NaoAutenticado, ok, Proibido, Validacao } from '@pz/kernel';

import {
  ESCOPOS_DO_APP_ALEM_DA_LEITURA,
  escoposDoCliente,
  escoposDoToken,
  FORMATO_PKCE,
} from '../domain/cliente-oauth.js';
import { CATALOGO_DE_PERMISSOES } from '../domain/permissoes.js';

import { EmissorDeTokens, VALIDADE_DO_ACESSO_MS } from './dispositivos.js';

import type { ConsultarPermissoes } from './autorizacao.js';
import type {
  ClienteOAuth,
  RegistroDinamico,
  RepositorioDeClientesOAuth,
  RepositorioDeRegistrosDinamicos,
} from './clientes-oauth.js';
import type { TokensDeDispositivo } from './dispositivos.js';
import type {
  ArmazemDeRenovacoes,
  ArmazemDeSessoes,
  GeradorDeTokens,
  PublicadorDeEventos,
  RepositorioDeDispositivos,
} from './portas.js';
import type { NoTenant } from './redefinicao.js';
import type { Permissao } from '../domain/permissoes.js';
import type { Sessao } from '../domain/sessao.js';
import type { Clock, Instant, Result, Uuid } from '@pz/kernel';

/** O código vale uma vez e por pouco tempo (OAuth 2.1, seção 4.1.2: no máximo 10 min). */
export const VALIDADE_DO_CODIGO_MS = 60_000;

/** O que o código de autorização guarda (só o hash dele é a chave). */
export interface DadosDoCodigo {
  readonly clienteId: Uuid;
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly redirectUri: string;
  readonly desafio: string;
  readonly escopos: readonly string[];
  /** Registro dinâmico (HU60): o `client_id` que o assistente usa (o do registro). */
  readonly clienteDoPedido?: Uuid;
  /** App oficial (HU65): a sessão de dispositivo nasce do tipo `mobile`. */
  readonly appOficial?: true;
}

/** Códigos de autorização: uso único (consumir apaga). */
export interface ArmazemDeCodigos {
  emitir(codigo: string, dados: DadosDoCodigo, expiraEm: Instant): Promise<void>;
  consumir(codigo: string): Promise<DadosDoCodigo | undefined>;
}

/** `code_challenge` S256 a partir do `code_verifier` (RFC 7636, seção 4.2). */
export type DesafioPkce = (verificador: string) => string;

/** Pedido de autorização (RFC 6749, seção 4.1.1, com PKCE obrigatório do OAuth 2.1). */
export interface PedidoDeAutorizacao {
  readonly responseType: string;
  readonly clienteId: Uuid;
  readonly redirectUri: string;
  readonly escopo?: string;
  readonly estado?: string;
  readonly desafio: string;
  readonly metodoDoDesafio: string;
}

export interface DescricaoDaAutorizacao {
  readonly cliente: { readonly id: Uuid; readonly nome: string };
  /** Registrado sozinho pelo assistente (HU60): nome não verificado pelo escritório. */
  readonly registroAutomatico: boolean;
  readonly redirectUri: string;
  readonly escopos: readonly { readonly escopo: string; readonly descricao: string }[];
}

const pedidoInvalido = (mensagem: string, codigo = 'invalid_request') =>
  new Validacao([{ campo: 'pedido', mensagem }], codigo);

/**
 * Confere o pedido na tela de consentimento: o cliente público é do escritório de quem está
 * logado (RLS), o endereço de retorno é um dos cadastrados (igualdade exata), o PKCE é S256 e os
 * escopos são de leitura, do cliente e de quem autoriza. Só no portal (sessão do navegador): um
 * token de app ou integração, ou a impersonação (só leitura), não autoriza outro app.
 */
/** Escopos possíveis de um registro dinâmico: todos os de leitura (o advogado limita). */
const ESCOPOS_DE_LEITURA = Object.entries(CATALOGO_DE_PERMISSOES)
  .filter(([, p]) => p.leitura)
  .map(([e]) => e);

/** O registro visto como cliente público, só para conferir o pedido. */
const comoCliente = (r: RegistroDinamico, sessao: Sessao): ClienteOAuth => ({
  id: r.id,
  tenantId: sessao.tenantId,
  usuarioId: sessao.usuarioId,
  nome: r.nome,
  tipo: 'publico',
  redirectUris: r.redirectUris,
  escopos:
    r.appOficial === true
      ? [...ESCOPOS_DE_LEITURA, ...ESCOPOS_DO_APP_ALEM_DA_LEITURA]
      : ESCOPOS_DE_LEITURA,
  criadoEm: r.criadoEm,
});

async function conferir(
  clientes: RepositorioDeClientesOAuth,
  registros: RepositorioDeRegistrosDinamicos,
  permissoes: ConsultarPermissoes,
  sessao: Sessao,
  pedido: PedidoDeAutorizacao,
): Promise<
  Result<
    { descricao: DescricaoDaAutorizacao; escopos: Permissao[]; registro?: RegistroDinamico },
    Validacao | Proibido
  >
> {
  if (
    sessao.dispositivoId !== undefined ||
    sessao.escopos !== undefined ||
    sessao.impersonacao !== undefined
  ) {
    return err(new Proibido('autorizacao-so-no-portal', 'Autorize pelo portal, com sua senha.'));
  }
  // Do escritório (HU49) ou, se não for, um registro dinâmico (HU60).
  const doEscritorio = await clientes.buscar(pedido.clienteId);
  const registro =
    doEscritorio === undefined ? await registros.buscar(pedido.clienteId) : undefined;
  const cliente =
    doEscritorio ?? (registro === undefined ? undefined : comoCliente(registro, sessao));
  if (cliente?.tipo !== 'publico' || cliente.revogadoEm !== undefined) {
    return err(pedidoInvalido('Aplicativo desconhecido ou revogado.', 'invalid_client'));
  }
  if (!cliente.redirectUris.includes(pedido.redirectUri)) {
    return err(pedidoInvalido('Endereço de retorno não cadastrado para o aplicativo.'));
  }
  if (pedido.responseType !== 'code') {
    return err(pedidoInvalido('Só `response_type=code`.', 'unsupported_response_type'));
  }
  if (pedido.metodoDoDesafio !== 'S256' || !FORMATO_PKCE.test(pedido.desafio)) {
    return err(pedidoInvalido('PKCE obrigatório, com `code_challenge_method=S256`.'));
  }
  const pedidos = escoposDoToken(pedido.escopo, cliente.escopos);
  if (pedidos === undefined) {
    return err(pedidoInvalido('Escopo não concedido ao aplicativo.', 'invalid_scope'));
  }
  const alem =
    registro?.appOficial === true ? ESCOPOS_DO_APP_ALEM_DA_LEITURA : new Set<Permissao>();
  const escopos = escoposDoCliente(pedidos, await permissoes.executar(sessao), alem);
  if (!escopos.ok) return err(pedidoInvalido(escopos.erro.message, 'invalid_scope'));
  return ok({
    escopos: escopos.valor,
    ...(registro === undefined ? {} : { registro }),
    descricao: {
      cliente: { id: cliente.id, nome: cliente.nome },
      registroAutomatico: registro !== undefined && registro.appOficial !== true,
      redirectUri: pedido.redirectUri,
      escopos: escopos.valor.map((e) => ({
        escopo: e,
        descricao: CATALOGO_DE_PERMISSOES[e].descricao,
      })),
    },
  });
}

/** GET da tela de consentimento: o que o app pede, já conferido. */
export class DescreverAutorizacao {
  constructor(
    private readonly clientes: RepositorioDeClientesOAuth,
    private readonly registros: RepositorioDeRegistrosDinamicos,
    private readonly permissoes: ConsultarPermissoes,
  ) {}

  async executar(
    sessao: Sessao,
    pedido: PedidoDeAutorizacao,
  ): Promise<Result<DescricaoDaAutorizacao, Validacao | Proibido>> {
    const r = await conferir(this.clientes, this.registros, this.permissoes, sessao, pedido);
    return r.ok ? ok(r.valor.descricao) : r;
  }
}

/**
 * O advogado permitiu: emite o código (uso único, 60 s), audita e devolve o endereço de retorno
 * com `code` e `state`. Negar não passa por aqui: o portal volta com `error=access_denied`.
 */
export class AutorizarCliente {
  constructor(
    private readonly clientes: RepositorioDeClientesOAuth,
    private readonly registros: RepositorioDeRegistrosDinamicos,
    private readonly permissoes: ConsultarPermissoes,
    private readonly codigos: ArmazemDeCodigos,
    private readonly tokens: GeradorDeTokens,
    private readonly publicador: PublicadorDeEventos,
    private readonly relogio: Clock,
  ) {}

  async executar(
    sessao: Sessao,
    pedido: PedidoDeAutorizacao,
  ): Promise<Result<{ readonly redirecionarPara: string }, Validacao | Proibido>> {
    const r = await conferir(this.clientes, this.registros, this.permissoes, sessao, pedido);
    if (!r.ok) return r;
    const codigo = this.tokens.novoToken();
    const agora = this.relogio.agora();
    // Registro dinâmico: o escritório ganha (ou reaproveita) o cliente ligado a ele (HU60).
    const { registro } = r.valor;
    const clienteId =
      registro === undefined
        ? pedido.clienteId
        : (
            await this.clientes.obterOuCriarDoRegistro({
              ...comoCliente(registro, sessao),
              id: gerarUuidV7(this.relogio),
              criadoEm: agora,
              registroDinamicoId: registro.id,
            })
          ).id;
    await this.codigos.emitir(
      codigo,
      {
        clienteId,
        ...(registro === undefined ? {} : { clienteDoPedido: registro.id }),
        ...(registro?.appOficial === true ? { appOficial: true as const } : {}),
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        redirectUri: pedido.redirectUri,
        desafio: pedido.desafio,
        escopos: r.valor.escopos,
      },
      agora.maisMs(VALIDADE_DO_CODIGO_MS),
    );
    await this.publicador.publicar(sessao.tenantId, [
      {
        id: gerarUuidV7(this.relogio),
        tipo: 'ClienteOAuthAutorizado',
        versao: 1,
        tenantId: sessao.tenantId,
        agregadoId: clienteId,
        ocorridoEm: agora,
        payload: {
          clienteId,
          usuarioId: sessao.usuarioId,
          escopos: r.valor.escopos.join(' '),
        },
      },
    ]);
    const destino = new URL(pedido.redirectUri);
    destino.searchParams.set('code', codigo);
    if (pedido.estado !== undefined) destino.searchParams.set('state', pedido.estado);
    return ok({ redirecionarPara: destino.toString() });
  }
}

const concessaoInvalida = () =>
  new NaoAutenticado('invalid_grant', 'Código inválido, expirado ou já usado.');

/**
 * Grant `authorization_code` (OAuth 2.1, seção 4.1.3): consome o código, confere cliente,
 * endereço de retorno e PKCE, abre uma sessão de dispositivo ligada ao cliente e emite o par de
 * tokens (acesso de 15 min e renovação rotativa), só nos escopos autorizados.
 */
export class TrocarCodigoPorTokens {
  readonly #emissor: EmissorDeTokens;

  constructor(
    private readonly clientes: RepositorioDeClientesOAuth,
    private readonly codigos: ArmazemDeCodigos,
    private readonly desafioPkce: DesafioPkce,
    private readonly dispositivos: RepositorioDeDispositivos,
    sessoes: ArmazemDeSessoes,
    renovacoes: ArmazemDeRenovacoes,
    tokens: GeradorDeTokens,
    private readonly publicador: PublicadorDeEventos,
    private readonly relogio: Clock,
    private readonly noTenant: NoTenant,
  ) {
    this.#emissor = new EmissorDeTokens(sessoes, renovacoes, tokens, relogio);
  }

  async executar(entrada: {
    readonly codigo: string;
    readonly clienteId: Uuid;
    readonly redirectUri: string;
    readonly verificador: string;
  }): Promise<Result<TokensDeDispositivo, NaoAutenticado>> {
    const dados = await this.codigos.consumir(entrada.codigo);
    if (dados === undefined) return err(concessaoInvalida());
    const doPedido = dados.clienteDoPedido ?? dados.clienteId;
    if (doPedido !== entrada.clienteId || dados.redirectUri !== entrada.redirectUri) {
      return err(concessaoInvalida());
    }
    if (
      !FORMATO_PKCE.test(entrada.verificador) ||
      this.desafioPkce(entrada.verificador) !== dados.desafio
    ) {
      return err(concessaoInvalida());
    }
    const cliente = await this.clientes.localizar(dados.clienteId);
    if (cliente?.tipo !== 'publico' || cliente.revogado || cliente.tenantSuspenso) {
      return err(new NaoAutenticado('invalid_client', 'Aplicativo desconhecido ou revogado.'));
    }
    const agora = this.relogio.agora();
    const dispositivoId = gerarUuidV7(this.relogio);
    // App oficial (HU65): sessão mobile. Assistente registrado sozinho (HU60): MCP.
    const tipoCliente =
      dados.appOficial === true
        ? 'mobile'
        : dados.clienteDoPedido === undefined
          ? 'integrador'
          : 'mcp';
    await this.noTenant(dados.tenantId, async () => {
      await this.dispositivos.registrar({
        id: dispositivoId,
        usuarioId: dados.usuarioId,
        tenantId: dados.tenantId,
        tipoCliente,
        nome: (await this.clientes.buscar(dados.clienteId))?.nome ?? 'Aplicativo',
        criadoEm: agora,
        ultimoUso: agora,
        clienteOAuthId: dados.clienteId,
      });
      await this.clientes.registrarUso(dados.clienteId, agora);
    });
    await this.publicador.publicar(dados.tenantId, [
      {
        id: gerarUuidV7(this.relogio),
        tipo: 'DispositivoRegistrado',
        versao: 1,
        tenantId: dados.tenantId,
        agregadoId: dispositivoId,
        ocorridoEm: agora,
        payload: { dispositivoId, usuarioId: dados.usuarioId, tipoCliente },
      },
    ]);
    const tokens = await this.#emissor.emitir({
      dispositivoId,
      usuarioId: dados.usuarioId,
      tenantId: dados.tenantId,
      clienteOAuthId: dados.clienteId,
      escopos: dados.escopos,
      tipoCliente,
      ...(dados.clienteDoPedido === undefined ? {} : { clienteDoPedido: dados.clienteDoPedido }),
    });
    return ok(tokens);
  }
}

export const VALIDADE_DO_ACESSO_EM_SEGUNDOS = VALIDADE_DO_ACESSO_MS / 1000;
