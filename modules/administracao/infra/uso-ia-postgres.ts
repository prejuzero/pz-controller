import { LocalDate } from '@pz/kernel';

import type { ConsultaDeUsoDeIa, LinhaDeUsoDeIa } from '../application/uso-ia.js';
import type { Transacao } from '@pz/db';
import type { ChamadaDeIa, RegistroDeUsoDeIa } from '@pz/ia';
import type { UnidadeDeTrabalho } from '@pz/kernel';

/**
 * Uso de IA no PostgreSQL (`uso_ia`, HU21). Tabela global (sem tenant): o worker grava numa
 * transação sem tenant; o administrador lê pela API. O acúmulo é um único INSERT ... ON CONFLICT,
 * atômico entre workers concorrentes.
 */
export class UsoDeIaPostgres implements ConsultaDeUsoDeIa<Transacao> {
  async porPeriodo(tx: Transacao, de: LocalDate, ate: LocalDate): Promise<LinhaDeUsoDeIa[]> {
    const linhas = await tx.usoIa.findMany({
      where: { dia: { gte: data(de), lte: data(ate) } },
      orderBy: [{ dia: 'asc' }, { tarefa: 'asc' }, { modelo: 'asc' }],
    });
    return linhas.map((l) => ({
      dia: LocalDate.de(l.dia.getUTCFullYear(), l.dia.getUTCMonth() + 1, l.dia.getUTCDate()),
      tarefa: l.tarefa,
      modelo: l.modelo,
      chamadas: l.chamadas,
      tokensEntrada: Number(l.tokensEntrada),
      tokensSaida: Number(l.tokensSaida),
      tokensCacheLidos: Number(l.tokensCacheLidos),
      custoUsd: l.custoEstimadoUsd.toNumber(),
    }));
  }

  /** Registro para a plataforma de IA (porta de @pz/ia), cada operação numa transação própria. */
  registro(unidade: UnidadeDeTrabalho<Transacao>): RegistroDeUsoDeIa {
    return {
      registrar: (chamada) => unidade.executar((tx) => acumular(tx, chamada)),
      custoNoDia: (dia) =>
        unidade.executar(async (tx) => {
          const { _sum } = await tx.usoIa.aggregate({
            where: { dia: data(dia) },
            _sum: { custoEstimadoUsd: true },
          });
          return _sum.custoEstimadoUsd?.toNumber() ?? 0;
        }),
    };
  }
}

async function acumular(tx: Transacao, c: ChamadaDeIa): Promise<void> {
  const { tokensEntrada, tokensSaida, tokensCacheLidos } = c.uso;
  await tx.$executeRaw`
    INSERT INTO uso_ia (dia, tarefa, modelo, chamadas, tokens_entrada, tokens_saida,
                        tokens_cache_lidos, custo_estimado_usd)
    VALUES (${c.dia.paraIso()}::date, ${c.tarefa}, ${c.modelo}, 1, ${tokensEntrada},
            ${tokensSaida}, ${tokensCacheLidos}, ${c.custoUsd})
    ON CONFLICT (dia, tarefa, modelo) DO UPDATE SET
      chamadas = uso_ia.chamadas + 1,
      tokens_entrada = uso_ia.tokens_entrada + EXCLUDED.tokens_entrada,
      tokens_saida = uso_ia.tokens_saida + EXCLUDED.tokens_saida,
      tokens_cache_lidos = uso_ia.tokens_cache_lidos + EXCLUDED.tokens_cache_lidos,
      custo_estimado_usd = uso_ia.custo_estimado_usd + EXCLUDED.custo_estimado_usd,
      atualizado_em = CURRENT_TIMESTAMP`;
}

/** Coluna DATE: o Prisma usa meia-noite UTC do dia. */
function data(dia: LocalDate): Date {
  return new Date(`${dia.paraIso()}T00:00:00Z`);
}
