import { ehPermissao } from '../domain/permissoes.js';

import type { Permissao } from '../domain/permissoes.js';
import type { Sessao } from '../domain/sessao.js';
import type { Uuid } from '@pz/kernel';

/** Perfis atribuídos ao usuário no tenant (RLS) e as permissões que eles concedem. */
export interface RepositorioDePerfis {
  permissoesDoUsuario(tenantId: Uuid, usuarioId: Uuid): Promise<readonly string[]>;
}

/** Avisado quando o banco concede uma permissão fora do catálogo (nunca em silêncio). */
export type AvisoDePermissaoDesconhecida = (permissao: string) => void;

/**
 * Permissões da sessão (HU07), lidas a cada requisição: mudar o perfil vale na hora. Sessão sem
 * o 2FA não tem permissão alguma. Permissão do banco fora do catálogo é ignorada e avisada.
 */
export class ConsultarPermissoes {
  constructor(
    private readonly perfis: RepositorioDePerfis,
    private readonly avisar: AvisoDePermissaoDesconhecida,
  ) {}

  async executar(sessao: Sessao): Promise<ReadonlySet<Permissao>> {
    if (sessao.nivel !== 'completo') return new Set();
    const concedidas = await this.perfis.permissoesDoUsuario(sessao.tenantId, sessao.usuarioId);
    const validas = new Set<Permissao>();
    for (const permissao of concedidas) {
      if (ehPermissao(permissao)) validas.add(permissao);
      else this.avisar(permissao);
    }
    return validas;
  }
}
