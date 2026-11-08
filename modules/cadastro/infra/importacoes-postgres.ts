import { Instant } from '@pz/kernel';

import type { ImportacaoDeProcessos, RepositorioDeImportacoes } from '../application/portas.js';
import type { ProcessoDaPlanilha } from '../domain/importacao.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

type Linha = NonNullable<Awaited<ReturnType<Transacao['importacaoProcesso']['findUnique']>>>;
const instante = (data: Date) => Instant.deEpochMs(data.getTime());
const importacao = (l: Linha): ImportacaoDeProcessos => ({
  id: l.id as Uuid,
  tenantId: l.tenantId as Uuid,
  solicitadaPor: l.solicitadaPor as Uuid,
  // Gravadas por este repositório a partir das linhas validadas.
  linhas: l.linhas as unknown as ProcessoDaPlanilha[],
  // CHECK da tabela garante o valor.
  situacao: l.situacao as ImportacaoDeProcessos['situacao'],
  criados: l.criados,
  jaExistiam: l.jaExistiam,
  solicitadaEm: instante(l.solicitadaEm),
  concluidaEm: l.concluidaEm === null ? null : instante(l.concluidaEm),
});

/** Importações de processos no tenant da transação (RLS). */
export class ImportacoesPostgres implements RepositorioDeImportacoes<Transacao> {
  async inserir(tx: Transacao, i: ImportacaoDeProcessos): Promise<void> {
    await tx.importacaoProcesso.create({
      data: {
        id: i.id,
        tenantId: i.tenantId,
        solicitadaPor: i.solicitadaPor,
        linhas: i.linhas.map((l) => ({ ...l })),
        situacao: i.situacao,
        total: i.linhas.length,
        solicitadaEm: new Date(i.solicitadaEm.epochMs),
      },
    });
  }

  async buscar(tx: Transacao, id: Uuid): Promise<ImportacaoDeProcessos | undefined> {
    const linha = await tx.importacaoProcesso.findUnique({ where: { id } });
    return linha === null ? undefined : importacao(linha);
  }

  async concluir(
    tx: Transacao,
    id: Uuid,
    d: { criados: number; jaExistiam: number; em: Instant },
  ): Promise<void> {
    await tx.importacaoProcesso.update({
      where: { id },
      data: {
        situacao: 'concluida',
        criados: d.criados,
        jaExistiam: d.jaExistiam,
        concluidaEm: new Date(d.em.epochMs),
      },
    });
  }
}
