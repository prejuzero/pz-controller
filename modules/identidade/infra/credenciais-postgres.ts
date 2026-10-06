import type { CredencialArmazenada, RepositorioDeCredenciais } from '../application/portas.js';
import type { Email } from '../domain/credenciais.js';
import type { Banco } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/**
 * Credenciais no PostgreSQL. O login usa `pz_localizar_credencial` (função restrita, decisão de
 * 06/10/2026): a api segue sem BYPASSRLS e o RLS esconde todo o resto. A troca de senha roda no
 * tenant do contexto, sob RLS.
 */
export class CredenciaisPostgres implements RepositorioDeCredenciais {
  constructor(private readonly banco: Banco) {}

  async localizarPorEmail(email: Email): Promise<CredencialArmazenada | undefined> {
    const [linha] = await this.banco.executarSemTenant(
      'login: localizar credencial',
      (tx) =>
        tx.$queryRaw<{ usuario_id: string; tenant_id: string; senha_hash: string | null }[]>`
        SELECT usuario_id, tenant_id, senha_hash FROM pz_localizar_credencial(${email})`,
    );
    return linha === undefined
      ? undefined
      : {
          usuarioId: linha.usuario_id as Uuid,
          tenantId: linha.tenant_id as Uuid,
          senhaHash: linha.senha_hash,
        };
  }

  async definirSenha(usuarioId: Uuid, senhaHash: string): Promise<void> {
    await this.banco.executar((tx) =>
      tx.usuario.update({ where: { id: usuarioId }, data: { senhaHash } }),
    );
  }
}
