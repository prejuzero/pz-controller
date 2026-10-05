import { metrics } from '@opentelemetry/api';

import type { BatchObservableResult, Counter, Gauge, Histogram, Meter } from '@opentelemetry/api';

/**
 * Catálogo único de métricas do PrejuZero (ADR-011). Os dashboards e alertas da HU03
 * dependem destes nomes e atributos: mudar um deles exige atualizar `infra/observabilidade`.
 * Latência e erros por rota HTTP vêm da instrumentação HTTP do OpenTelemetry.
 */
export const NOMES_METRICAS = {
  jobDuracao: 'pz.fila.job.duracao',
  filaAguardando: 'pz.fila.aguardando',
  filaIdadeMaisAntigo: 'pz.fila.idade_mais_antigo',
  filaDlq: 'pz.fila.dlq',
  integracaoDuracao: 'pz.integracao.chamada.duracao',
  integracaoCircuito: 'pz.integracao.circuito.estado',
  emailRejeicoes: 'pz.email.rejeicoes',
  erros: 'pz.erros',
} as const;

export type ResultadoOperacao = 'sucesso' | 'falha';

/** 0 = fechado (normal), 1 = meio-aberto (testando), 2 = aberto (adaptador degradado). */
export const ESTADO_CIRCUITO = { fechado: 0, meioAberto: 1, aberto: 2 } as const;
export type EstadoCircuito = keyof typeof ESTADO_CIRCUITO;

interface Instrumentos {
  readonly jobDuracao: Histogram;
  readonly integracaoDuracao: Histogram;
  readonly integracaoCircuito: Gauge;
  readonly emailRejeicoes: Counter;
  readonly erros: Counter;
}

const NOME_MEDIDOR = '@pz/observability';
// O provedor devolve o mesmo Meter para o mesmo nome; o cache evita recriar instrumentos
// e acompanha a troca de provedor (testes, reinício da telemetria).
const cache = new WeakMap<Meter, Instrumentos>();

function instrumentos(): Instrumentos {
  const medidor = metrics.getMeter(NOME_MEDIDOR);
  let existentes = cache.get(medidor);
  if (existentes === undefined) {
    existentes = {
      jobDuracao: medidor.createHistogram(NOMES_METRICAS.jobDuracao, {
        description: 'Duração do processamento de jobs, por fila e resultado.',
        unit: 's',
      }),
      integracaoDuracao: medidor.createHistogram(NOMES_METRICAS.integracaoDuracao, {
        description: 'Duração das chamadas a adaptadores de integração, por resultado.',
        unit: 's',
      }),
      integracaoCircuito: medidor.createGauge(NOMES_METRICAS.integracaoCircuito, {
        description:
          'Estado do circuit breaker por adaptador (0 fechado, 1 meio-aberto, 2 aberto).',
      }),
      emailRejeicoes: medidor.createCounter(NOMES_METRICAS.emailRejeicoes, {
        description: 'E-mails rejeitados pelo provedor (bounce ou reclamação).',
      }),
      erros: medidor.createCounter(NOMES_METRICAS.erros, {
        description: 'Erros inesperados registrados, por origem.',
      }),
    };
    cache.set(medidor, existentes);
  }
  return existentes;
}

export function registrarJobProcessado(
  fila: string,
  resultado: ResultadoOperacao,
  duracaoSegundos: number,
): void {
  instrumentos().jobDuracao.record(duracaoSegundos, { fila, resultado });
}

export function registrarChamadaIntegracao(
  adaptador: string,
  operacao: string,
  resultado: ResultadoOperacao,
  duracaoSegundos: number,
): void {
  instrumentos().integracaoDuracao.record(duracaoSegundos, { adaptador, operacao, resultado });
}

export function registrarEstadoCircuito(adaptador: string, estado: EstadoCircuito): void {
  instrumentos().integracaoCircuito.record(ESTADO_CIRCUITO[estado], { adaptador });
}

export function registrarRejeicaoEmail(motivo: string): void {
  instrumentos().emailRejeicoes.add(1, { motivo });
}

export function registrarErroInesperado(origem: string): void {
  instrumentos().erros.add(1, { origem });
}

export interface SituacaoFila {
  readonly fila: string;
  readonly aguardando: number;
  readonly idadeMaisAntigoSegundos: number;
  readonly dlq: number;
}

/**
 * Registra a leitura periódica da situação das filas (profundidade, idade do job mais antigo
 * e DLQ). `consultar` é chamada a cada coleta; devolve a função que cancela o registro.
 */
export function registrarSituacaoDasFilas(
  consultar: () => Promise<readonly SituacaoFila[]>,
): () => void {
  const medidor = metrics.getMeter(NOME_MEDIDOR);
  const aguardando = medidor.createObservableGauge(NOMES_METRICAS.filaAguardando, {
    description: 'Jobs aguardando processamento, por fila.',
  });
  const idade = medidor.createObservableGauge(NOMES_METRICAS.filaIdadeMaisAntigo, {
    description: 'Idade do job aguardando há mais tempo, por fila.',
    unit: 's',
  });
  const dlq = medidor.createObservableGauge(NOMES_METRICAS.filaDlq, {
    description: 'Jobs na fila de mensagens mortas (DLQ), por fila.',
  });
  const observaveis = [aguardando, idade, dlq];
  const coletar = async (resultado: BatchObservableResult) => {
    for (const situacao of await consultar()) {
      const atributos = { fila: situacao.fila };
      resultado.observe(aguardando, situacao.aguardando, atributos);
      resultado.observe(idade, situacao.idadeMaisAntigoSegundos, atributos);
      resultado.observe(dlq, situacao.dlq, atributos);
    }
  };
  medidor.addBatchObservableCallback(coletar, observaveis);
  return () => {
    medidor.removeBatchObservableCallback(coletar, observaveis);
  };
}
