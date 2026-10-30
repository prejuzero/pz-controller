import { Instant } from '@pz/kernel';

import type { Compromisso, RepositorioDeCompromissos } from '../application/compromissos.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

type Linha = Awaited<ReturnType<Transacao['compromisso']['findFirstOrThrow']>>;
const instante = (d: Date) => Instant.deEpochMs(d.getTime());

const restaurar = (l: Linha): Compromisso => ({
  id: l.id as Uuid,
  tenantId: l.tenantId as Uuid,
  titulo: l.titulo,
  dataHora: instante(l.dataHora),
  local: l.local,
  processoId: l.processoId as Uuid | null,
  lembretesMinutos: l.lembretesMinutos,
  criadoPor: l.criadoPor as Uuid,
  canceladoEm: l.canceladoEm === null ? null : instante(l.canceladoEm),
  motivoCancelamento: l.motivoCancelamento,
});

/** Compromissos do tenant da transação (RLS). Sem DELETE: cancelar é estado. */
export class CompromissosPostgres implements RepositorioDeCompromissos<Transacao> {
  async inserir(tx: Transacao, c: Compromisso): Promise<void> {
    await tx.compromisso.create({
      data: {
        id: c.id,
        tenantId: c.tenantId,
        titulo: c.titulo,
        dataHora: new Date(c.dataHora.epochMs),
        local: c.local,
        processoId: c.processoId,
        lembretesMinutos: [...c.lembretesMinutos],
        criadoPor: c.criadoPor,
      },
    });
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Compromisso | undefined> {
    const l = await tx.compromisso.findUnique({ where: { id } });
    return l === null ? undefined : restaurar(l);
  }

  async cancelar(tx: Transacao, c: Compromisso): Promise<boolean> {
    if (c.canceladoEm === null) return false;
    const { count } = await tx.compromisso.updateMany({
      where: { id: c.id, canceladoEm: null },
      data: {
        canceladoEm: new Date(c.canceladoEm.epochMs),
        motivoCancelamento: c.motivoCancelamento,
      },
    });
    return count === 1;
  }

  async doPeriodo(tx: Transacao, de: Instant, ate: Instant, limite: number) {
    const linhas = await tx.compromisso.findMany({
      where: {
        canceladoEm: null,
        dataHora: { gte: new Date(de.epochMs), lte: new Date(ate.epochMs) },
      },
      orderBy: [{ dataHora: 'asc' }, { id: 'asc' }],
      take: limite,
    });
    return linhas.map(restaurar);
  }
}
