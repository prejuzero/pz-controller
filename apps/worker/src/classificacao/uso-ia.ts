import { UsoDeIaPostgres } from '@pz/administracao';
import { RegistroComOrcamentoDiario } from '@pz/ia';
import { registrarOrcamentoDiarioIaExcedido } from '@pz/observability';

import type { Banco } from '@pz/db';
import type { RegistroDeUsoDeIa } from '@pz/ia';
import type { Logger } from '@pz/observability';

/**
 * Uso e custo de IA por dia, tarefa e modelo (HU21): tabela global, gravada sem tenant. Acima do
 * orçamento diário em US$, métrica e log de erro uma vez por dia (alerta `ia-orcamento-diario`).
 */
export function registroDeUsoDeIa(
  banco: Pick<Banco, 'executarSemTenant'>,
  orcamentoDiarioUsd: number,
  logger: Logger,
): RegistroDeUsoDeIa {
  return new RegistroComOrcamentoDiario(
    new UsoDeIaPostgres().registro({
      executar: (trabalho) => banco.executarSemTenant('registro do uso de IA', trabalho),
    }),
    orcamentoDiarioUsd,
    (alerta) => {
      registrarOrcamentoDiarioIaExcedido();
      logger.error(
        { ...alerta, dia: alerta.dia.paraIso() },
        'custo diário de IA acima do orçamento',
      );
    },
  );
}
