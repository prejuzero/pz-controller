import { Instant } from '@pz/kernel';

import type { Exportacao, RepositorioDeExportacoes } from '../application/portas.js';
import type { EscopoDeExportacao } from '../domain/exportacao.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

type Linha = NonNullable<Awaited<ReturnType<Transacao['exportacaoDados']['findUnique']>>>;
const instante = (data: Date) => Instant.deEpochMs(data.getTime());
const exportacao = (l: Linha): Exportacao => ({
  id: l.id as Uuid,
  tenantId: l.tenantId as Uuid,
  usuarioId: l.usuarioId as Uuid,
  escopo: l.escopo,
  situacao: l.situacao,
  solicitadaEm: instante(l.solicitadaEm),
  ...(l.concluidaEm === null ? {} : { concluidaEm: instante(l.concluidaEm) }),
  ...(l.expiraEm === null ? {} : { expiraEm: instante(l.expiraEm) }),
});

/** Pedidos de exportação no tenant da transação (RLS). */
export class ExportacoesPostgres implements RepositorioDeExportacoes<Transacao> {
  async inserir(tx: Transacao, e: Exportacao): Promise<void> {
    await tx.exportacaoDados.create({
      data: {
        id: e.id,
        tenantId: e.tenantId,
        usuarioId: e.usuarioId,
        escopo: e.escopo,
        situacao: e.situacao,
        solicitadaEm: new Date(e.solicitadaEm.epochMs),
      },
    });
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Exportacao | undefined> {
    const linha = await tx.exportacaoDados.findUnique({ where: { id } });
    return linha === null ? undefined : exportacao(linha);
  }

  async pendente(
    tx: Transacao,
    usuarioId: Uuid,
    escopo: EscopoDeExportacao,
  ): Promise<Exportacao | undefined> {
    const linha = await tx.exportacaoDados.findFirst({
      where: { usuarioId, escopo, situacao: 'pendente' },
    });
    return linha === null ? undefined : exportacao(linha);
  }

  async concluir(tx: Transacao, id: Uuid, em: Instant, expiraEm: Instant): Promise<void> {
    await tx.exportacaoDados.update({
      where: { id },
      data: {
        situacao: 'concluida',
        concluidaEm: new Date(em.epochMs),
        expiraEm: new Date(expiraEm.epochMs),
      },
    });
  }
}
