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
      // Membro desativado (HU41) não recebe avisos nem prazos.
      where: { dono: { permissoes: { some: { permissao } } }, usuario: { desativadoEm: null } },
      select: { usuarioId: true },
      distinct: ['usuarioId'],
      orderBy: { usuarioId: 'asc' },
    });
    return linhas.map((linha) => linha.usuarioId as Uuid);
  }

  /** Membros ativos com a permissão, com o nome (quem pode receber um prazo delegado, HU41). */
  async membros(tx: Transacao, permissao: Permissao): Promise<{ usuarioId: Uuid; nome: string }[]> {
    const linhas = await tx.usuario.findMany({
      where: {
        desativadoEm: null,
        perfis: { some: { dono: { permissoes: { some: { permissao } } } } },
      },
      select: { id: true, nome: true },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    return linhas.map((l) => ({ usuarioId: l.id as Uuid, nome: l.nome }));
  }
}
