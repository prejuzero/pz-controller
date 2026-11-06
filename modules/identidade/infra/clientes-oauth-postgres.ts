import { Instant } from '@pz/kernel';

import { hashDoToken, segredoConfere } from './tokens.js';

import type {
  ClienteAutenticado,
  ClienteOAuth,
  RepositorioDeClientesOAuth,
} from '../application/clientes-oauth.js';
import type { Banco } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Clientes OAuth no PostgreSQL (tabela `cliente_oauth`, RLS por tenant). O endpoint de token usa
 * `pz_localizar_cliente_oauth` (função restrita, como o login): a api segue sem BYPASSRLS.
 */
export class ClientesOAuthPostgres implements RepositorioDeClientesOAuth {
  constructor(private readonly banco: Banco) {}

  async registrar(c: ClienteOAuth, segredo: string): Promise<void> {
    await this.banco.executar((tx) =>
      tx.clienteOauth.create({
        data: {
          id: c.id,
          tenantId: c.tenantId,
          usuarioId: c.usuarioId,
          nome: c.nome,
          segredoHash: hashDoToken(segredo),
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
    return linhas.map((l) => ({
      id: l.id as Uuid,
      tenantId: l.tenantId as Uuid,
      usuarioId: l.usuarioId as Uuid,
      nome: l.nome,
      escopos: l.escopos,
      criadoEm: Instant.deEpochMs(l.criadoEm.getTime()),
      ...(l.ultimoUso === null ? {} : { ultimoUso: Instant.deEpochMs(l.ultimoUso.getTime()) }),
      ...(l.revogadoEm === null ? {} : { revogadoEm: Instant.deEpochMs(l.revogadoEm.getTime()) }),
    }));
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
    if (!UUID.test(id)) return undefined;
    const [linha] = await this.banco.executarSemTenant(
      'oauth: localizar cliente',
      (tx) =>
        tx.$queryRaw<
          {
            tenant_id: string;
            usuario_id: string;
            segredo_hash: string;
            escopos: string[];
            revogado: boolean;
            tenant_suspenso: boolean;
          }[]
        >`SELECT tenant_id, usuario_id, segredo_hash, escopos, revogado, tenant_suspenso FROM pz_localizar_cliente_oauth(${id}::uuid)`,
    );
    if (linha === undefined || !segredoConfere(segredo, linha.segredo_hash)) return undefined;
    return {
      tenantId: linha.tenant_id as Uuid,
      usuarioId: linha.usuario_id as Uuid,
      escopos: linha.escopos,
      revogado: linha.revogado,
      tenantSuspenso: linha.tenant_suspenso,
    };
  }

  async registrarUso(id: Uuid, agora: Instant): Promise<void> {
    await this.banco.executar((tx) =>
      tx.clienteOauth.update({ where: { id }, data: { ultimoUso: new Date(agora.epochMs) } }),
    );
  }
}
