import { Instant } from '@pz/kernel';

import type { Relatorio, RepositorioDeRelatorios } from '../application/portas.js';
import type { Formato, SituacaoDoRelatorio, TipoDeRelatorio } from '../domain/relatorio.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

type Linha = NonNullable<Awaited<ReturnType<Transacao['relatorio']['findUnique']>>>;
const instante = (data: Date) => Instant.deEpochMs(data.getTime());
const relatorio = (l: Linha): Relatorio => ({
  id: l.id as Uuid,
  tenantId: l.tenantId as Uuid,
  usuarioId: l.usuarioId as Uuid,
  // CHECKs da tabela garantem os valores.
  tipo: l.tipo as TipoDeRelatorio,
  formato: l.formato as Formato,
  situacao: l.situacao as SituacaoDoRelatorio,
  filtros: l.filtros as Record<string, unknown>,
  solicitadoEm: instante(l.solicitadoEm),
  ...(l.linhas === null ? {} : { linhas: l.linhas }),
  ...(l.concluidoEm === null ? {} : { concluidoEm: instante(l.concluidoEm) }),
  ...(l.expiraEm === null ? {} : { expiraEm: instante(l.expiraEm) }),
});

/** Pedidos de relatório no tenant da transação (RLS). */
export class RelatoriosPostgres implements RepositorioDeRelatorios<Transacao> {
  async inserir(tx: Transacao, r: Relatorio): Promise<void> {
    await tx.relatorio.create({
      data: {
        id: r.id,
        tenantId: r.tenantId,
        usuarioId: r.usuarioId,
        tipo: r.tipo,
        formato: r.formato,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- o tsc exige (Json do Prisma não aceita unknown); o eslint não enxerga o tipo gerado.
        filtros: r.filtros as unknown as object,
        situacao: r.situacao,
        solicitadoEm: new Date(r.solicitadoEm.epochMs),
      },
    });
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Relatorio | undefined> {
    const linha = await tx.relatorio.findUnique({ where: { id } });
    return linha === null ? undefined : relatorio(linha);
  }

  async recentes(tx: Transacao, usuarioId: Uuid, limite: number): Promise<Relatorio[]> {
    const linhas = await tx.relatorio.findMany({
      where: { usuarioId },
      orderBy: [{ solicitadoEm: 'desc' }, { id: 'desc' }],
      take: limite,
    });
    return linhas.map(relatorio);
  }

  async concluir(
    tx: Transacao,
    id: Uuid,
    c: { em: Instant; expiraEm: Instant; linhas: number },
  ): Promise<void> {
    await tx.relatorio.update({
      where: { id },
      data: {
        situacao: 'concluido',
        linhas: c.linhas,
        concluidoEm: new Date(c.em.epochMs),
        expiraEm: new Date(c.expiraEm.epochMs),
      },
    });
  }

  /** Só um pendente falha; o concluído fica como está. */
  async falhar(tx: Transacao, id: Uuid): Promise<void> {
    await tx.relatorio.updateMany({
      where: { id, situacao: 'pendente' },
      data: { situacao: 'falhou' },
    });
  }
}
