import { LocalDate, type Instant } from '@pz/kernel';

/**
 * Porta: uso de tokens de IA por tenant, tarefa e mês (HU58). Implementação persistente na
 * composição (Redis ou banco); em memória para testes.
 */
export interface ContadorDeUsoDeIa {
  usoNoMes(tenantId: string, tarefa: string, mes: string): Promise<number>;
  registrar(tenantId: string, tarefa: string, mes: string, tokens: number): Promise<void>;
}

export class ContadorDeUsoEmMemoria implements ContadorDeUsoDeIa {
  readonly #uso = new Map<string, number>();

  usoNoMes(tenantId: string, tarefa: string, mes: string): Promise<number> {
    return Promise.resolve(this.#uso.get(`${tenantId}|${tarefa}|${mes}`) ?? 0);
  }

  registrar(tenantId: string, tarefa: string, mes: string, tokens: number): Promise<void> {
    const chave = `${tenantId}|${tarefa}|${mes}`;
    this.#uso.set(chave, (this.#uso.get(chave) ?? 0) + tokens);
    return Promise.resolve();
  }
}

/** Orçamento da tarefa esgotado no mês: a funcionalidade cai no fluxo manual ("a confirmar"). */
export class OrcamentoDeIaEsgotado extends Error {
  constructor(
    readonly tarefa: string,
    readonly tenantId: string,
  ) {
    super(`Orçamento mensal de IA esgotado: tarefa ${tarefa}`);
    this.name = 'OrcamentoDeIaEsgotado';
  }
}

export interface AlertaDeOrcamento {
  readonly tenantId: string;
  readonly tarefa: string;
  readonly usoTokens: number;
  readonly orcamentoTokens: number;
}

/** Mês corrente (AAAA-MM) no fuso de Brasília: o orçamento vira junto com o mês do escritório. */
export function mesDoOrcamento(agora: Instant): string {
  return LocalDate.doInstante(agora, 'America/Sao_Paulo').paraIso().slice(0, 7);
}
