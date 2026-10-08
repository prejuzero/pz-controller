import type { SituacaoAdaptador } from '@pz/integracoes';
import type { Instant } from '@pz/kernel';

/**
 * Saúde das integrações para o administrador (HU39). Cada instância do worker publica um retrato
 * do seu registro de adaptadores (o estado segue o circuit breaker, ADR-005); o painel junta os
 * retratos recentes e guarda as falhas novas num histórico curto.
 */
export interface Retrato {
  readonly instancia: string;
  readonly em: Instant;
  readonly situacoes: readonly SituacaoAdaptador[];
}

export interface FalhaDeIntegracao {
  readonly adaptador: string;
  readonly instancia: string;
  readonly em: Instant;
  readonly erro: string;
}

export interface IntegracaoConsolidada extends SituacaoAdaptador {
  /** Instâncias do worker que informaram este adaptador. */
  readonly instancias: number;
}

/** Retrato mais velho que isto é de instância parada: não entra no painel. */
export const VALIDADE_DO_RETRATO_MS = 2 * 60_000;

const GRAVIDADE = { operacional: 0, degradado: 1, indisponivel: 2 } as const;

const maisRecente = (a: Instant | undefined, b: Instant | undefined) =>
  a === undefined ? b : b === undefined || a.epochMs >= b.epochMs ? a : b;

/** Por adaptador: o pior estado entre as instâncias e o último sucesso e falha de qualquer uma. */
export function consolidar(retratos: readonly Retrato[], agora: Instant): IntegracaoConsolidada[] {
  const porAdaptador = new Map<string, IntegracaoConsolidada>();
  for (const retrato of retratos) {
    if (agora.epochMs - retrato.em.epochMs > VALIDADE_DO_RETRATO_MS) continue;
    for (const s of retrato.situacoes) {
      const atual = porAdaptador.get(s.adaptador);
      if (atual === undefined) {
        porAdaptador.set(s.adaptador, { ...s, instancias: 1 });
        continue;
      }
      const ultimaFalha = maisRecente(atual.ultimaFalha, s.ultimaFalha);
      const ultimoSucesso = maisRecente(atual.ultimoSucesso, s.ultimoSucesso);
      const erro = ultimaFalha === s.ultimaFalha ? s.erro : atual.erro;
      porAdaptador.set(s.adaptador, {
        adaptador: s.adaptador,
        estado: GRAVIDADE[s.estado] > GRAVIDADE[atual.estado] ? s.estado : atual.estado,
        instancias: atual.instancias + 1,
        ...(ultimoSucesso === undefined ? {} : { ultimoSucesso }),
        ...(ultimaFalha === undefined ? {} : { ultimaFalha }),
        ...(erro === undefined ? {} : { erro }),
      });
    }
  }
  return [...porAdaptador.values()].sort((a, b) => a.adaptador.localeCompare(b.adaptador));
}

/** Falhas que apareceram desde o retrato anterior da mesma instância. */
export function falhasNovas(anterior: Retrato | undefined, atual: Retrato): FalhaDeIntegracao[] {
  return atual.situacoes.flatMap((s) => {
    if (s.ultimaFalha === undefined) return [];
    const antes = anterior?.situacoes.find((a) => a.adaptador === s.adaptador)?.ultimaFalha;
    if (antes !== undefined && antes.epochMs >= s.ultimaFalha.epochMs) return [];
    return [
      { adaptador: s.adaptador, instancia: atual.instancia, em: s.ultimaFalha, erro: s.erro ?? '' },
    ];
  });
}
