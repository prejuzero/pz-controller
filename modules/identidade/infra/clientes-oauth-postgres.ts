import { Instant } from '@pz/kernel';

import { hashDoToken, segredoConfere } from './tokens.js';

import type {
  ClienteAutenticado,
  ClienteOAuth,
  RepositorioDeClientesOAuth,
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
        },
      }),
    );
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
