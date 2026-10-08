import { executarNoTenant } from '@pz/db';

import type { RepositorioDePerfis } from '../application/autorizacao.js';
import type { Permissao } from '../domain/permissoes.js';
import type { Banco, Transacao } from '@pz/db';
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

/** Usuários do tenant da transação (RLS) cujos perfis concedem a permissão. */
export class UsuariosComPermissaoPostgres {
  async listar(tx: Transacao, permissao: Permissao): Promise<Uuid[]> {
    const linhas = await tx.usuarioPerfil.findMany({
      where: { dono: { permissoes: { some: { permissao } } } },
      select: { usuarioId: true },
      distinct: ['usuarioId'],
      orderBy: { usuarioId: 'asc' },
    });
    return linhas.map((linha) => linha.usuarioId as Uuid);
  }
}
