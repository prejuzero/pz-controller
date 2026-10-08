import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';

import type { Counter, Histogram, Meter } from '@opentelemetry/api';

/**
 * Observabilidade de LLM (HU58, ADR-011/016). Métricas por tarefa e modelo, sem tenant (a
 * cardinalidade explodiria): o tenant vai só no span de cada chamada.
 */
export const NOMES_METRICAS_IA = {
  chamadaDuracao: 'pz.ia.chamada.duracao',
  tokens: 'pz.ia.tokens',
  fallbacks: 'pz.ia.fallbacks',
  esgotadas: 'pz.ia.tarefas_sem_modelo',
  orcamentoAlertas: 'pz.ia.orcamento.alertas',
  orcamentoDiario: 'pz.ia.orcamento_diario.excedido',
  correcoes: 'pz.ia.correcoes',
} as const;

/**
 * Resultado de uma tentativa: `sucesso`; `saida-invalida` (fora do schema ou com data proibida);
 * `erro-transitorio` (indisponível, cota, circuito: leva ao fallback); `erro` (demais).
 */
export type ResultadoChamadaIa = 'sucesso' | 'saida-invalida' | 'erro-transitorio' | 'erro';

export interface ChamadaIa {
  readonly tarefa: string;
  readonly provedor: string;
  readonly modelo: string;
  readonly versaoPrompt: string;
  readonly tenantId: string;
}

export interface DesfechoChamadaIa {
  readonly resultado: ResultadoChamadaIa;
  readonly duracaoSegundos: number;
  readonly tokensEntrada?: number;
  readonly tokensSaida?: number;
  readonly tokensCacheLidos?: number;
}

interface InstrumentosIa {
  readonly duracao: Histogram;
  readonly tokens: Counter;
  readonly fallbacks: Counter;
  readonly esgotadas: Counter;
  readonly orcamentoAlertas: Counter;
  readonly orcamentoDiario: Counter;
  readonly correcoes: Counter;
}

const NOME = '@pz/observability/ia';
const cache = new WeakMap<Meter, InstrumentosIa>();

function instrumentos(): InstrumentosIa {
  const medidor = metrics.getMeter(NOME);
  let existentes = cache.get(medidor);
  if (existentes === undefined) {
    existentes = {
      duracao: medidor.createHistogram(NOMES_METRICAS_IA.chamadaDuracao, {
        description:
          'Duração de cada tentativa de chamada a modelo, por tarefa, modelo e resultado.',
        unit: 's',
      }),
      tokens: medidor.createCounter(NOMES_METRICAS_IA.tokens, {
        description: 'Tokens consumidos por tarefa, modelo e tipo (entrada, saída, cache).',
      }),
      fallbacks: medidor.createCounter(NOMES_METRICAS_IA.fallbacks, {
        description: 'Fallbacks acionados: modelo que falhou e a tarefa passou ao próximo.',
      }),
      esgotadas: medidor.createCounter(NOMES_METRICAS_IA.esgotadas, {
        description: 'Tarefas em que todos os modelos falharam por indisponibilidade ou cota.',
      }),
      orcamentoAlertas: medidor.createCounter(NOMES_METRICAS_IA.orcamentoAlertas, {
        description: 'Chamadas com uso acima de 80% do orçamento mensal da tarefa.',
      }),
      orcamentoDiario: medidor.createCounter(NOMES_METRICAS_IA.orcamentoDiario, {
        description: 'Dias em que o custo estimado de IA da plataforma passou do orçamento diário.',
      }),
      correcoes: medidor.createCounter(NOMES_METRICAS_IA.correcoes, {
        description: 'Sugestões de IA corrigidas pelo advogado, por tarefa.',
      }),
    };
    cache.set(medidor, existentes);
  }
  return existentes;
}

const tracer = () => trace.getTracer(NOME);

/**
 * Envolve uma tentativa de chamada a modelo num span com os atributos GenAI do OpenTelemetry
 * (`gen_ai.*`) e os nossos (`pz.ia.*`), e registra a métrica de duração e tokens. O desfecho é
 * calculado por quem chama a partir do retorno ou do erro.
 */
export async function medirChamadaIa<T>(
  chamada: ChamadaIa,
  executar: () => Promise<T>,
  desfecho: (
    resultado: { valor: T } | { erro: unknown },
  ) => Omit<DesfechoChamadaIa, 'duracaoSegundos'>,
): Promise<T> {
  return tracer().startActiveSpan(`ia ${chamada.tarefa}`, async (span) => {
    span.setAttributes({
      'gen_ai.operation.name': 'chat',
      'gen_ai.system': chamada.provedor,
      'gen_ai.request.model': chamada.modelo,
      'pz.ia.tarefa': chamada.tarefa,
      'pz.ia.versao_prompt': chamada.versaoPrompt,
      'pz.tenant_id': chamada.tenantId,
    });
    const inicio = performance.now();
    const registrar = (dados: Omit<DesfechoChamadaIa, 'duracaoSegundos'>) => {
      const duracaoSegundos = (performance.now() - inicio) / 1000;
      registrarDesfecho(chamada, { ...dados, duracaoSegundos });
      span.setAttributes({
        'pz.ia.validacao': dados.resultado,
        ...(dados.tokensEntrada === undefined
          ? {}
          : { 'gen_ai.usage.input_tokens': dados.tokensEntrada }),
        ...(dados.tokensSaida === undefined
          ? {}
          : { 'gen_ai.usage.output_tokens': dados.tokensSaida }),
        ...(dados.tokensCacheLidos === undefined
          ? {}
          : { 'pz.ia.tokens_cache_lidos': dados.tokensCacheLidos }),
      });
    };
    try {
      const valor = await executar();
      registrar(desfecho({ valor }));
      return valor;
    } catch (erro) {
      registrar(desfecho({ erro }));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw erro;
    } finally {
      span.end();
    }
  });
}

function registrarDesfecho(chamada: ChamadaIa, desfecho: DesfechoChamadaIa): void {
  const { tarefa, modelo } = chamada;
  const i = instrumentos();
  i.duracao.record(desfecho.duracaoSegundos, { tarefa, modelo, resultado: desfecho.resultado });
  const tokens: [string, number | undefined][] = [
    ['entrada', desfecho.tokensEntrada],
    ['saida', desfecho.tokensSaida],
    ['cache', desfecho.tokensCacheLidos],
  ];
  for (const [tipo, quantidade] of tokens) {
    if (quantidade !== undefined && quantidade > 0)
      i.tokens.add(quantidade, { tarefa, modelo, tipo });
  }
  if (desfecho.resultado === 'erro-transitorio') i.fallbacks.add(1, { tarefa, modelo });
}

/** Todos os modelos da tarefa falharam por indisponibilidade ou cota (alerta crítico). */
export function registrarTarefaIaSemModelo(tarefa: string): void {
  instrumentos().esgotadas.add(1, { tarefa });
}

export function registrarAlertaDeOrcamentoIa(tarefa: string): void {
  instrumentos().orcamentoAlertas.add(1, { tarefa });
}

export function registrarOrcamentoDiarioIaExcedido(): void {
  instrumentos().orcamentoDiario.add(1);
}

export function registrarCorrecaoDeIa(tarefa: string): void {
  instrumentos().correcoes.add(1, { tarefa });
}
