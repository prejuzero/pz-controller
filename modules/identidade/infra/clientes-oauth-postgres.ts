import { Instant } from '@pz/kernel';

import { hashDoToken, segredoConfere } from './tokens.js';

import type {
  ClienteAutenticado,
  ClienteOAuth,
  RegistroDinamico,
  RepositorioDeClientesOAuth,
  RepositorioDeRegistrosDinamicos,
} from '../application/clientes-oauth.js';
import type { TipoDeClienteOAuth } from '../domain/cliente-oauth.js';
import type { Banco, Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LinhaDaFuncao {
  tenant_id: string;
  usuario_id: string;
  segredo_hash: string | null;
  escopos: string[];
  revogado: boolean;
  tenant_suspenso: boolean;
  tipo: string;
  redirect_uris: string[];
}

type LinhaDoCliente = Awaited<ReturnType<Transacao['clienteOauth']['findFirstOrThrow']>>;

const paraCliente = (l: LinhaDoCliente): ClienteOAuth => ({
  id: l.id as Uuid,
  tenantId: l.tenantId as Uuid,
  usuarioId: l.usuarioId as Uuid,
  nome: l.nome,
  tipo: l.tipo as TipoDeClienteOAuth,
  redirectUris: l.redirectUris,
  escopos: l.escopos,
  criadoEm: Instant.deEpochMs(l.criadoEm.getTime()),
  ...(l.ultimoUso === null ? {} : { ultimoUso: Instant.deEpochMs(l.ultimoUso.getTime()) }),
  ...(l.revogadoEm === null ? {} : { revogadoEm: Instant.deEpochMs(l.revogadoEm.getTime()) }),
  ...(l.registroDinamicoId === null ? {} : { registroDinamicoId: l.registroDinamicoId as Uuid }),
});

const paraAutenticado = (l: LinhaDaFuncao): ClienteAutenticado => ({
  tenantId: l.tenant_id as Uuid,
  usuarioId: l.usuario_id as Uuid,
  tipo: l.tipo as TipoDeClienteOAuth,
  redirectUris: l.redirect_uris,
  escopos: l.escopos,
  revogado: l.revogado,
  tenantSuspenso: l.tenant_suspenso,
});

/**
 * Clientes OAuth no PostgreSQL (tabela `cliente_oauth`, RLS por tenant). O endpoint de token usa
 * `pz_localizar_cliente_oauth` (função restrita, como o login): a api segue sem BYPASSRLS.
 */
export class ClientesOAuthPostgres implements RepositorioDeClientesOAuth {
  constructor(private readonly banco: Banco) {}

  async registrar(c: ClienteOAuth, segredo: string | null): Promise<void> {
    await this.banco.executar((tx) =>
      tx.clienteOauth.create({
        data: {
          id: c.id,
          tenantId: c.tenantId,
          usuarioId: c.usuarioId,
          nome: c.nome,
          segredoHash: segredo === null ? null : hashDoToken(segredo),
          tipo: c.tipo,
          redirectUris: [...c.redirectUris],
          escopos: [...c.escopos],
          criadoEm: new Date(c.criadoEm.epochMs),
          registroDinamicoId: c.registroDinamicoId ?? null,
        },
      }),
    );
  }

  async obterOuCriarDoRegistro(c: ClienteOAuth): Promise<ClienteOAuth> {
    const registroDinamicoId = c.registroDinamicoId;
    if (registroDinamicoId === undefined) throw new Error('cliente sem registro dinâmico');
    return this.banco.executar(async (tx) => {
      // Índice único parcial (um ativo por registro no escritório): repetido não aborta.
      await tx.clienteOauth.createMany({
        data: [
          {
            id: c.id,
            tenantId: c.tenantId,
            usuarioId: c.usuarioId,
            nome: c.nome,
            tipo: 'publico',
            redirectUris: [...c.redirectUris],
            escopos: [...c.escopos],
            criadoEm: new Date(c.criadoEm.epochMs),
            registroDinamicoId,
          },
        ],
        skipDuplicates: true,
      });
      const linha = await tx.clienteOauth.findFirstOrThrow({
        where: { registroDinamicoId, revogadoEm: null },
      });
      return paraCliente(linha);
    });
  }

  async listar(): Promise<ClienteOAuth[]> {
    const linhas = await this.banco.executar((tx) =>
      tx.clienteOauth.findMany({ orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }] }),
    );
    return linhas.map(paraCliente);
  }

  async buscar(id: Uuid): Promise<ClienteOAuth | undefined> {
    if (!UUID.test(id)) return undefined;
    const linha = await this.banco.executar((tx) => tx.clienteOauth.findUnique({ where: { id } }));
    return linha === null ? undefined : paraCliente(linha);
  }

  async revogar(id: Uuid, agora: Instant): Promise<boolean> {
    const { count } = await this.banco.executar((tx) =>
      tx.clienteOauth.updateMany({
        where: { id, revogadoEm: null },
        data: { revogadoEm: new Date(agora.epochMs) },
      }),
    );
    return count > 0;
  }

  async autenticar(id: Uuid, segredo: string): Promise<ClienteAutenticado | undefined> {
    const linha = await this.#localizar(id);
    // Cliente público não tem segredo: não passa pelo Client Credentials.
    const hash = linha?.segredo_hash ?? null;
    if (linha === undefined || hash === null || !segredoConfere(segredo, hash)) return undefined;
    return paraAutenticado(linha);
  }

  async localizar(id: Uuid): Promise<ClienteAutenticado | undefined> {
    const linha = await this.#localizar(id);
    return linha === undefined ? undefined : paraAutenticado(linha);
  }

  async #localizar(id: Uuid): Promise<LinhaDaFuncao | undefined> {
    if (!UUID.test(id)) return undefined;
    const [linha] = await this.banco.executarSemTenant(
      'oauth: localizar cliente',
      (tx) =>
        tx.$queryRaw<
          LinhaDaFuncao[]
        >`SELECT tenant_id, usuario_id, segredo_hash, escopos, revogado, tenant_suspenso, tipo, redirect_uris FROM pz_localizar_cliente_oauth(${id}::uuid)`,
    );
    return linha;
  }

  async registrarUso(id: Uuid, agora: Instant): Promise<void> {
    await this.banco.executar((tx) =>
      tx.clienteOauth.update({ where: { id }, data: { ultimoUso: new Date(agora.epochMs) } }),
    );
  }
}

/**
 * Registros dinâmicos (HU60): tabela global, sem tenant; o registro é público. O app oficial
 * (HU65) é um registro fixo da migração; os endereços de retorno dele vêm da configuração
 * (APP_OAUTH_REDIRECT_URIS), para trocar o esquema do app sem migração.
 */
export class RegistrosDinamicosPostgres implements RepositorioDeRegistrosDinamicos {
  constructor(
    private readonly banco: Banco,
    private readonly retornoDoApp?: readonly string[],
  ) {}

  async registrar(r: RegistroDinamico): Promise<void> {
    await this.banco.executarSemTenant('oauth: registro dinâmico', (tx) =>
      tx.registroOauthDinamico.create({
        data: {
          id: r.id,
          nome: r.nome,
          redirectUris: [...r.redirectUris],
          criadoEm: new Date(r.criadoEm.epochMs),
        },
      }),
    );
  }

  async buscar(id: Uuid): Promise<RegistroDinamico | undefined> {
    if (!UUID.test(id)) return undefined;
    const l = await this.banco.executarSemTenant('oauth: registro dinâmico', (tx) =>
      tx.registroOauthDinamico.findUnique({ where: { id } }),
    );
    return l === null
      ? undefined
      : {
          id: l.id as Uuid,
          nome: l.nome,
          redirectUris: l.appOficial ? (this.retornoDoApp ?? l.redirectUris) : l.redirectUris,
          criadoEm: Instant.deEpochMs(l.criadoEm.getTime()),
          ...(l.appOficial ? { appOficial: true } : {}),
        };
  }
}
