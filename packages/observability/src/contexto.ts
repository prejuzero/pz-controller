import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Identificadores de correlação da execução atual (requisição HTTP ou job de fila).
 * Preenchidos por quem inicia a execução (middleware HTTP, consumidor de fila) e lidos
 * pelo logger e pela captura de erros. Nunca contêm dado pessoal: só identificadores.
 */
export interface ContextoExecucao {
  readonly requestId?: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly jobId?: string;
  readonly fila?: string;
}

const armazenamento = new AsyncLocalStorage<ContextoExecucao>();

/** Executa `funcao` com o contexto atual acrescido de `contexto` (os novos campos prevalecem). */
export function executarComContexto<Resultado>(
  contexto: ContextoExecucao,
  funcao: () => Resultado,
): Resultado {
  return armazenamento.run({ ...obterContexto(), ...contexto }, funcao);
}

export function obterContexto(): ContextoExecucao {
  return armazenamento.getStore() ?? {};
}
