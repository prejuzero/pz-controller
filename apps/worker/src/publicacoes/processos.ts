import { executarNoTenant } from '@pz/db';

import type { ObterOuCriarProcesso, UnidadeNoTenant } from '@pz/cadastro';
import type { UnidadeDeTrabalho, Uuid } from '@pz/kernel';
import type { ObterOuCriarProcessoNoTenant } from '@pz/publicacoes';

/** Processo da publicação pelo cadastro (HU12/HU18); número inválido lança (vai para a DLQ). */
export function processoPeloCadastro(
  obterOuCriar: Pick<ObterOuCriarProcesso<unknown>, 'executar'>,
): ObterOuCriarProcessoNoTenant {
  return async (tenantId, numeroCnj) => {
    const r = await obterOuCriar.executar(tenantId, numeroCnj);
    if (!r.ok) throw r.erro;
    return r.valor.processoId;
  };
}

/** Unidade no tenant informado sobre o banco da aplicação (RLS pelo tenant da execução). */
export function noTenantDoBanco<Transacao>(
  banco: UnidadeDeTrabalho<Transacao>,
): UnidadeNoTenant<Transacao> {
  return {
    executar: (tenantId: Uuid, trabalho) =>
      executarNoTenant(tenantId, () => banco.executar(trabalho)),
  };
}
