import { AsyncLocalStorage } from 'node:async_hooks';

import { ehUuid } from '@pz/kernel';
import { executarComContexto } from '@pz/observability';

import type { Uuid } from '@pz/kernel';

/**
 * Tenant da execução atual (ADR-003): a fonte de verdade para o isolamento no banco.
 * HTTP: definido a partir da sessão (HU06). Worker: a partir do payload do job (HU10).
 */
const armazenamento = new AsyncLocalStorage<Uuid>();

/** Lançado quando se tenta acessar dados de negócio sem tenant definido: nunca silencioso. */
export class SemTenant extends Error {
  constructor() {
    super(
      'Operação no banco sem tenant definido: use executarNoTenant (ou o BancoSistema, com motivo).',
    );
    this.name = 'SemTenant';
  }
}

/** Executa `trabalho` no tenant informado; também o leva para a correlação dos logs. */
export function executarNoTenant<Resultado>(tenantId: Uuid, trabalho: () => Resultado): Resultado {
  if (!ehUuid(tenantId)) throw new RangeError(`tenantId inválido: "${String(tenantId)}"`);
  return armazenamento.run(tenantId, () => executarComContexto({ tenantId }, trabalho));
}

export function tenantAtual(): Uuid | undefined {
  return armazenamento.getStore();
}
