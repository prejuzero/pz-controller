import type { ContaNova, RepositorioDeContas } from '../application/contas.js';
import type { Transacao } from '@pz/db';

/**
 * Conta nova no PostgreSQL (HU11), como pz_app no tenant novo da transação: a política
 * `cadastro_autonomo` só deixa criar tenant `autonomo` com o id do contexto. O e-mail repetido
 * (índice único global) vira `false` sem abortar a transação (`ON CONFLICT DO NOTHING`).
 */
export class ContasPostgres implements RepositorioDeContas<Transacao> {
  async criar(tx: Transacao, conta: ContaNova): Promise<boolean> {
    await tx.tenant.create({
      data: { id: conta.tenantId, nome: conta.nomeDoTenant, tipo: 'autonomo' },
    });
    const { count } = await tx.usuario.createMany({
      data: [
        {
          id: conta.usuarioId,
          tenantId: conta.tenantId,
          nome: conta.nome,
          email: conta.email,
          senhaHash: conta.senhaHash,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return false;
    await tx.usuarioPerfil.create({
      data: { tenantId: conta.tenantId, usuarioId: conta.usuarioId, perfil: 'advogado' },
    });
    return true;
  }
}
