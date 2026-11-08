import { Instant } from '@pz/kernel';

import type { NomeMonitorado, RepositorioDeNomesMonitorados } from '../application/portas.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

type Linha = NonNullable<Awaited<ReturnType<Transacao['nomeMonitorado']['findFirst']>>>;
const nome = (l: Linha): NomeMonitorado => ({
  id: l.id as Uuid,
  tenantId: l.tenantId as Uuid,
  nome: l.nome,
  valor: l.valor,
  criadoPor: l.criadoPor as Uuid,
  criadoEm: Instant.deEpochMs(l.criadoEm.getTime()),
});

/** Nomes monitorados no tenant da transação (RLS); remover é marcar, nunca apagar. */
export class NomesMonitoradosPostgres implements RepositorioDeNomesMonitorados<Transacao> {
  async ativos(tx: Transacao): Promise<NomeMonitorado[]> {
    const linhas = await tx.nomeMonitorado.findMany({
      where: { removidoEm: null },
      orderBy: { id: 'asc' },
    });
    return linhas.map(nome);
  }

  async inserir(tx: Transacao, n: NomeMonitorado): Promise<boolean> {
    // ON CONFLICT no índice parcial dos ativos: repetido não aborta a transação.
    const inseridas = await tx.$executeRaw`
      INSERT INTO nome_monitorado (id, tenant_id, nome, valor, criado_por, criado_em, atualizado_em)
      VALUES (${n.id}::uuid, ${n.tenantId}::uuid, ${n.nome}, ${n.valor}, ${n.criadoPor}::uuid,
              ${new Date(n.criadoEm.epochMs)}, ${new Date(n.criadoEm.epochMs)})
      ON CONFLICT (tenant_id, valor) WHERE removido_em IS NULL DO NOTHING`;
    return inseridas === 1;
  }

  async remover(
    tx: Transacao,
    id: Uuid,
    r: { por: Uuid; em: Instant },
  ): Promise<NomeMonitorado | undefined> {
    const atual = await tx.nomeMonitorado.findFirst({ where: { id, removidoEm: null } });
    if (atual === null) return undefined;
    await tx.nomeMonitorado.update({
      where: { id },
      data: { removidoEm: new Date(r.em.epochMs), removidoPor: r.por },
    });
    return nome(atual);
  }
}
