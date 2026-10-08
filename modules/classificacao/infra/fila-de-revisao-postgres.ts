import { Instant } from '@pz/kernel';
import { z } from 'zod';

import type {
  ConsultaDaRevisaoManual,
  ItemDaRevisaoManual,
} from '../application/fila-de-revisao.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

// Os CHECKs da tabela garantem origem e situação; o JSON e o motivo são conferidos na leitura.
const Linha = z.object({
  origem: z.enum(['regra', 'ia', 'nenhuma']),
  motivo: z.enum(['saida-invalida', 'ia-desligada', 'sem-orcamento']).nullable(),
  evidencias: z.array(
    z.object({ inicio: z.number().int(), fim: z.number().int(), trecho: z.string() }),
  ),
});

/** Fila de revisão manual no PostgreSQL (tabela global `classificacao`), em ordem de conteúdo. */
export class RevisaoManualPostgres implements ConsultaDaRevisaoManual<Transacao> {
  async listar(
    tx: Transacao,
    pagina: { readonly limite: number; readonly apos?: Uuid },
  ): Promise<ItemDaRevisaoManual[]> {
    const linhas = await tx.classificacao.findMany({
      where: {
        situacao: 'revisao_manual',
        ...(pagina.apos === undefined ? {} : { conteudoId: { gt: pagina.apos } }),
      },
      orderBy: { conteudoId: 'asc' },
      take: pagina.limite,
    });
    return linhas.map((l) => {
      const { origem, motivo, evidencias } = Linha.parse(l);
      return {
        conteudoId: l.conteudoId as Uuid,
        origem,
        motivo,
        tipoAto: l.tipoAto,
        confianca: l.confianca?.toNumber() ?? null,
        evidencias,
        versaoPrompt: l.versaoPrompt,
        modelo: l.modelo,
        criadaEm: Instant.deEpochMs(l.criadoEm.getTime()),
      };
    });
  }
}
