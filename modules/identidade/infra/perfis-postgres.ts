import { executarNoTenant } from '@pz/db';

import type { RepositorioDePerfis } from '../application/autorizacao.js';
import type { Banco } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** Perfis do usuário (`usuario_perfil`, RLS) e as permissões que concedem (`perfil_permissao`). */
export class PerfisPostgres implements RepositorioDePerfis {
  constructor(private readonly banco: Banco) {}

  async permissoesDoUsuario(tenantId: Uuid, usuarioId: Uuid): Promise<readonly string[]> {
    const linhas = await executarNoTenant(tenantId, () =>
      this.banco.executar((tx) =>
        tx.perfilPermissao.findMany({
          where: { dono: { usuarios: { some: { usuarioId } } } },
          select: { permissao: true },
          distinct: ['permissao'],
        }),
      ),
    );
    return linhas.map((linha) => linha.permissao);
  }
}
