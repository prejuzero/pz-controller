import { err, gerarUuidV7, NaoAutenticado, NaoEncontrado, ok, Validacao } from '@pz/kernel';

import { enderecosDeRetorno, escoposDoCliente, escoposDoToken } from '../domain/cliente-oauth.js';
import { expiracao } from '../domain/sessao.js';

import { VALIDADE_DO_ACESSO_MS } from './dispositivos.js';

import type { ConsultarPermissoes } from './autorizacao.js';
import type {
  ArmazemDeRenovacoes,
  ArmazemDeSessoes,
  GeradorDeTokens,
  PublicadorDeEventos,
  RepositorioDeDispositivos,
} from './portas.js';
import type { NoTenant } from './redefinicao.js';
import type { TipoDeClienteOAuth } from '../domain/cliente-oauth.js';
import type { Sessao } from '../domain/sessao.js';
import type { Clock, Instant, Result, Uuid } from '@pz/kernel';

/**
 * Cliente OAuth (HU49). Confidencial: integrador que age em nome de quem o registrou. Público:
 * app que age em nome de quem o autorizar (Authorization Code + PKCE). Sempre só nos escopos dele.
 */
export interface ClienteOAuth {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly nome: string;
  readonly tipo: TipoDeClienteOAuth;
  readonly redirectUris: readonly string[];
  readonly escopos: readonly string[];
  readonly criadoEm: Instant;
  readonly ultimoUso?: Instant;
  readonly revogadoEm?: Instant;
}

/** O que o endpoint de token precisa do cliente (sem tenant no pedido). */
export interface ClienteAutenticado {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly tipo: TipoDeClienteOAuth;
  readonly redirectUris: readonly string[];
  readonly escopos: readonly string[];
  readonly revogado: boolean;
  readonly tenantSuspenso: boolean;
}

export interface RepositorioDeClientesOAuth {
  /** Guarda só o hash do segredo (cliente público não tem segredo). */
  registrar(cliente: ClienteOAuth, segredo: string | null): Promise<void>;
  /** Clientes do tenant do contexto (RLS). */
  listar(): Promise<ClienteOAuth[]>;
  /** Um cliente do tenant do contexto (RLS): a tela de consentimento só vê os do escritório. */
  buscar(id: Uuid): Promise<ClienteOAuth | undefined>;
  /** Marca como revogado no tenant do contexto; `false` se não existe ou já estava revogado. */
  revogar(id: Uuid, agora: Instant): Promise<boolean>;
  /** Sem tenant (endpoint público): confere o segredo em tempo constante (só confidencial). */
  autenticar(id: Uuid, segredo: string): Promise<ClienteAutenticado | undefined>;
  /** Sem tenant e sem segredo: o cliente público do pedido de token (o PKCE prova a posse). */
  localizar(id: Uuid): Promise<ClienteAutenticado | undefined>;
  registrarUso(id: Uuid, agora: Instant): Promise<void>;
}

export interface ClienteRegistrado {
  readonly cliente: ClienteOAuth;
  /** Mostrado uma única vez; depois só o hash existe. `null` no cliente público. */
  readonly segredo: string | null;
}

export interface TokenDeCliente {
  readonly tokenDeAcesso: string;
  readonly expiraEm: Instant;
  /** `expires_in` do RFC 6749. */
  readonly validadeEmSegundos: number;
  readonly escopos: readonly string[];
}

/** Erros do endpoint de token, com o código do RFC 6749 (seção 5.2) em `codigo`. */
export type ErroDoToken = NaoAutenticado | Validacao;

function evento(
  tipo: 'ClienteOAuthRegistrado' | 'ClienteOAuthRevogado',
  sessao: Sessao,
  clienteId: Uuid,
  payload: Record<string, string>,
  relogio: Clock,
) {
  return {
    id: gerarUuidV7(relogio),
    tipo,
    versao: 1,
    tenantId: sessao.tenantId,
    agregadoId: clienteId,
    ocorridoEm: relogio.agora(),
    payload: { clienteId, usuarioId: sessao.usuarioId, ...payload },
  };
}

export class RegistrarClienteOAuth {
  constructor(
    private readonly clientes: RepositorioDeClientesOAuth,
    private readonly permissoes: ConsultarPermissoes,
    private readonly tokens: GeradorDeTokens,
    private readonly publicador: PublicadorDeEventos,
    private readonly relogio: Clock,
  ) {}

  async executar(
    sessao: Sessao,
    entrada: {
      readonly nome: string;
      readonly escopos: readonly string[];
      readonly tipo?: TipoDeClienteOAuth;
      readonly redirectUris?: readonly string[];
    },
  ): Promise<Result<ClienteRegistrado, Validacao>> {
    const escopos = escoposDoCliente(entrada.escopos, await this.permissoes.executar(sessao));
    if (!escopos.ok) return escopos;
    const tipo = entrada.tipo ?? 'confidencial';
    const enderecos = tipo === 'publico' ? enderecosDeRetorno(entrada.redirectUris ?? []) : ok([]);
    if (!enderecos.ok) return enderecos;
    const cliente: ClienteOAuth = {
      id: gerarUuidV7(this.relogio),
      tenantId: sessao.tenantId,
      usuarioId: sessao.usuarioId,
      nome: entrada.nome.trim().slice(0, 100),
      tipo,
      redirectUris: enderecos.valor,
      escopos: escopos.valor,
      criadoEm: this.relogio.agora(),
    };
    const segredo = tipo === 'confidencial' ? this.tokens.novoToken() : null;
    await this.clientes.registrar(cliente, segredo);
    await this.publicador.publicar(sessao.tenantId, [
      evento(
        'ClienteOAuthRegistrado',
        sessao,
        cliente.id,
        { escopos: cliente.escopos.join(' '), tipo },
        this.relogio,
      ),
    ]);
    return ok({ cliente, segredo });
  }
}

export class ListarClientesOAuth {
  constructor(private readonly clientes: RepositorioDeClientesOAuth) {}

  executar(): Promise<ClienteOAuth[]> {
    return this.clientes.listar();
  }
}

/**
 * Revoga o cliente e derruba na hora os tokens já emitidos para ele: os do Client Credentials e
 * as sessões (acesso e renovação) de cada autorização dada a ele.
 */
export class RevogarClienteOAuth {
  constructor(
    private readonly clientes: RepositorioDeClientesOAuth,
    private readonly sessoes: ArmazemDeSessoes,
    private readonly dispositivos: RepositorioDeDispositivos,
    private readonly renovacoes: ArmazemDeRenovacoes,
    private readonly publicador: PublicadorDeEventos,
    private readonly relogio: Clock,
  ) {}

  async executar(sessao: Sessao, id: Uuid): Promise<Result<void, NaoEncontrado>> {
    const agora = this.relogio.agora();
    if (!(await this.clientes.revogar(id, agora))) {
      return err(new NaoEncontrado('cliente-nao-encontrado', 'Integração não encontrada.'));
    }
    await this.sessoes.removerTodasDoDispositivo(id);
    for (const dispositivoId of await this.dispositivos.revogarDoCliente(id, agora)) {
      await this.sessoes.removerTodasDoDispositivo(dispositivoId);
      await this.renovacoes.revogarDoDispositivo(dispositivoId);
    }
    await this.publicador.publicar(sessao.tenantId, [
      evento('ClienteOAuthRevogado', sessao, id, {}, this.relogio),
    ]);
    return ok(undefined);
  }
}

const clienteInvalido = () =>
  new NaoAutenticado('invalid_client', 'Cliente desconhecido, revogado ou segredo incorreto.');

/**
 * Client Credentials (RFC 6749, seção 4.4; OAuth 2.1): troca id e segredo por um token de acesso
 * curto, sem renovação (o integrador pede outro). O token é uma sessão do usuário dono do
 * cliente, revogável com ele, cujas permissões são os escopos (e só enquanto o dono os tiver).
 */
export class EmitirTokenDeCliente {
  constructor(
    private readonly clientes: RepositorioDeClientesOAuth,
    private readonly sessoes: ArmazemDeSessoes,
    private readonly tokens: GeradorDeTokens,
    private readonly relogio: Clock,
    private readonly noTenant: NoTenant,
  ) {}

  async executar(entrada: {
    readonly clienteId: Uuid;
    readonly segredo: string;
    readonly escopo?: string;
  }): Promise<Result<TokenDeCliente, ErroDoToken>> {
    const cliente = await this.clientes.autenticar(entrada.clienteId, entrada.segredo);
    // Escritório suspenso (HU39) não recebe token, como no login.
    if (cliente?.tipo !== 'confidencial' || cliente.revogado || cliente.tenantSuspenso) {
      return err(clienteInvalido());
    }
    const escopos = escoposDoToken(entrada.escopo, cliente.escopos);
    if (escopos === undefined) {
      return err(
        new Validacao(
          [{ campo: 'scope', mensagem: 'Escopo não concedido a este cliente.' }],
          'invalid_scope',
        ),
      );
    }
    const agora = this.relogio.agora();
    const sessao: Sessao = {
      id: gerarUuidV7(this.relogio),
      usuarioId: cliente.usuarioId,
      tenantId: cliente.tenantId,
      nivel: 'completo',
      segundoFatorAtivo: true,
      criadaEm: agora,
      ultimoUso: agora,
      dispositivoId: entrada.clienteId,
      expiraAte: agora.maisMs(VALIDADE_DO_ACESSO_MS),
      escopos,
    };
    const tokenDeAcesso = this.tokens.novoToken();
    await this.sessoes.gravar(tokenDeAcesso, sessao, expiracao(sessao));
    await this.noTenant(cliente.tenantId, () =>
      this.clientes.registrarUso(entrada.clienteId, agora),
    );
    return ok({
      tokenDeAcesso,
      expiraEm: expiracao(sessao),
      validadeEmSegundos: VALIDADE_DO_ACESSO_MS / 1000,
      escopos,
    });
  }
}
