import { Instant } from '@pz/kernel';

import type {
  OperacoesDeEncerramento,
  OperacoesDeRetencao,
  RepositorioDeEncerramentos,
} from '../application/portas.js';
import type { Encerramento } from '../domain/encerramento.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

const instante = (data: Date) => Instant.deEpochMs(data.getTime());

/** Pedido de encerramento no tenant da transação (RLS). */
export class EncerramentosPostgres implements RepositorioDeEncerramentos<Transacao> {
  async buscar(tx: Transacao, tenantId: Uuid): Promise<Encerramento | undefined> {
    const l = await tx.encerramentoConta.findUnique({ where: { tenantId } });
    if (l === null) return undefined;
    return {
      solicitadoPor: l.solicitadoPor as Uuid,
      solicitadoEm: instante(l.solicitadoEm),
      efetivarEm: instante(l.efetivarEm),
      ...(l.canceladoEm === null ? {} : { canceladoEm: instante(l.canceladoEm) }),
      ...(l.efetivadoEm === null ? {} : { efetivadoEm: instante(l.efetivadoEm) }),
    };
  }

  async salvarPedido(tx: Transacao, tenantId: Uuid, e: Encerramento): Promise<void> {
    const dados = {
      solicitadoPor: e.solicitadoPor,
      solicitadoEm: new Date(e.solicitadoEm.epochMs),
      efetivarEm: new Date(e.efetivarEm.epochMs),
      canceladoEm: null,
      efetivadoEm: null,
    };
    await tx.encerramentoConta.upsert({
      where: { tenantId },
      create: { tenantId, ...dados },
      update: dados,
    });
  }

  async cancelar(tx: Transacao, tenantId: Uuid, em: Instant): Promise<void> {
    await tx.encerramentoConta.update({
      where: { tenantId },
      data: { canceladoEm: new Date(em.epochMs) },
    });
  }
}

/** Efetivação como sistema (BYPASSRLS, com motivo na composição). */
export class OperacoesDeEncerramentoPostgres implements OperacoesDeEncerramento<Transacao> {
  async vencidos(tx: Transacao, agora: Instant): Promise<Uuid[]> {
    const linhas = await tx.encerramentoConta.findMany({
      where: { canceladoEm: null, efetivadoEm: null, efetivarEm: { lte: new Date(agora.epochMs) } },
      select: { tenantId: true },
      orderBy: { efetivarEm: 'asc' },
    });
    return linhas.map((l) => l.tenantId as Uuid);
  }

  async entrarNoTenant(tx: Transacao, tenantId: Uuid): Promise<void> {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  }

  async usuariosDoTenant(tx: Transacao, tenantId: Uuid): Promise<Uuid[]> {
    const linhas = await tx.usuario.findMany({ where: { tenantId }, select: { id: true } });
    return linhas.map((l) => l.id as Uuid);
  }

  async exportacoesDoTenant(tx: Transacao, tenantId: Uuid): Promise<Uuid[]> {
    const linhas = await tx.exportacaoDados.findMany({ where: { tenantId }, select: { id: true } });
    return linhas.map((l) => l.id as Uuid);
  }

  async efetivar(tx: Transacao, tenantId: Uuid): Promise<void> {
    await tx.$executeRaw`SELECT pz_efetivar_encerramento(${tenantId}::uuid)`;
  }
}

/** Retenção como sistema: as funções do banco conferem prazo e situação do tenant. */
export class OperacoesDeRetencaoPostgres implements OperacoesDeRetencao<Transacao> {
  async encerradosAntesDe(tx: Transacao, limite: Instant): Promise<Uuid[]> {
    const linhas = await tx.tenant.findMany({
      where: { encerradoEm: { lt: new Date(limite.epochMs) }, usuarios: { some: {} } },
      select: { id: true },
    });
    return linhas.map((l) => l.id as Uuid);
  }

  async entrarNoTenant(tx: Transacao, tenantId: Uuid): Promise<void> {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  }

  async expurgarProvas(tx: Transacao, tenantId: Uuid, dias: number): Promise<void> {
    await tx.$executeRaw`SELECT pz_expurgar_provas(${tenantId}::uuid, ${dias}::integer)`;
  }

  async expurgarAcessos(tx: Transacao, limite: Instant): Promise<number> {
    const { count } = await tx.acesso.deleteMany({
      where: { ocorridoEm: { lt: new Date(limite.epochMs) } },
    });
    return count;
  }
}
