import { classeProcessualCanonica } from '@pz/kernel';

import type { Transacao } from '@pz/db';

/**
 * Classes processuais que chegaram nas publicações (forma canônica), para a curadoria indicar o
 * ramo de cada uma. Global e sem dado pessoal: o nome da classe, da tabela do CNJ.
 */
export class ClassesVistasPostgres {
  async listar(tx: Transacao): Promise<{ classe: string; ocorrencias: number }[]> {
    const linhas = await tx.classeProcessualVista.findMany({
      select: { classe: true, ocorrencias: true },
      orderBy: [{ ocorrencias: 'desc' }, { classe: 'asc' }],
    });
    return linhas;
  }

  /**
   * Como sistema: recalcula a partir das publicações (a classe vem nos metadados da fonte). A mesma
   * classe com acentuação ou caixa diferentes soma numa só.
   */
  async recalcular(tx: Transacao): Promise<number> {
    const brutas = await tx.$queryRaw<{ classe: string; ocorrencias: bigint }[]>`
      SELECT metadados->>'nomeClasse' AS classe, count(*) AS ocorrencias
        FROM publicacao_conteudo
       WHERE metadados->>'nomeClasse' IS NOT NULL
       GROUP BY 1`;
    const contagem = new Map<string, number>();
    for (const { classe, ocorrencias } of brutas) {
      const canonica = classeProcessualCanonica(classe);
      if (canonica !== undefined)
        contagem.set(canonica, (contagem.get(canonica) ?? 0) + Number(ocorrencias));
    }
    for (const [classe, ocorrencias] of contagem) {
      await tx.$executeRaw`
        INSERT INTO classe_processual_vista (classe, ocorrencias) VALUES (${classe}, ${ocorrencias})
        ON CONFLICT (classe) DO UPDATE SET ocorrencias = EXCLUDED.ocorrencias, atualizado_em = now()`;
    }
    return contagem.size;
  }
}
