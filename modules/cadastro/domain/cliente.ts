import { gerarUuidV7 } from '@pz/kernel';

import type { Documento } from './valores.js';
import type { Clock, Uuid } from '@pz/kernel';

/** Cliente do escritório (HU12): agrupa processos para filtros e relatórios (RF43, RF56). */
export interface Cliente {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly nome: string;
  /** CPF ou CNPJ sem pontuação; opcional (o advogado nem sempre tem o documento à mão). */
  readonly documento: string | null;
}

export function novoCliente(
  dados: { tenantId: Uuid; nome: string; documento: Documento | null },
  relogio: Clock,
): Cliente {
  return {
    id: gerarUuidV7(relogio),
    tenantId: dados.tenantId,
    nome: dados.nome,
    documento: dados.documento?.valor ?? null,
  };
}
