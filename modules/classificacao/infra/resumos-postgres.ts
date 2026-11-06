import type { RepositorioDeResumos } from '../application/resumir-publicacao.js';
import type { Resumo } from '../domain/resumo.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** Resumos no PostgreSQL (tabela global `resumo_publicacao`, um por conteúdo). */
export class ResumosPostgres implements RepositorioDeResumos<Transacao> {
  async existe(tx: Transacao, conteudoId: Uuid): Promise<boolean> {
    return (await tx.resumoPublicacao.count({ where: { conteudoId } })) === 1;
  }

  async gravar(tx: Transacao, conteudoId: Uuid, r: Resumo): Promise<boolean> {
    // O primeiro resumo vale (ON CONFLICT DO NOTHING): consumidores paralelos não duplicam.
    const { count } = await tx.resumoPublicacao.createMany({
      data: [
        {
          conteudoId,
          situacao: r.situacao,
          texto: r.texto,
          providencia: r.providencia,
          trechos: [...r.trechos],
          modelo: r.modelo,
          versaoPrompt: r.versaoPrompt,
          motivo: r.motivo,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async buscar(tx: Transacao, conteudoId: Uuid): Promise<Resumo | undefined> {
    const l = await tx.resumoPublicacao.findUnique({ where: { conteudoId } });
    if (l === null) return undefined;
    return {
      situacao: l.situacao as Resumo['situacao'],
      texto: l.texto,
      providencia: l.providencia,
      trechos: l.trechos,
      modelo: l.modelo,
      versaoPrompt: l.versaoPrompt,
      motivo: l.motivo as Resumo['motivo'],
    };
  }
}
