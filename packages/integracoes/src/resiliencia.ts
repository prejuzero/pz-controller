import { AsyncLocalStorage } from 'node:async_hooks';

import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  criarLogger,
  registrarChamadaIntegracao,
  registrarErro,
  registrarEstadoCircuito,
} from '@pz/observability';
import {
  bulkhead,
  circuitBreaker,
  CircuitState,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleWhen,
  isBrokenCircuitError,
  isBulkheadRejectedError,
  isTaskCancelledError,
  retry,
  timeout,
  TimeoutStrategy,
} from 'cockatiel';

import { ErroIntegracao, ErroLimiteExcedido, ErroPermanente, ErroTransitorio } from './erros.js';

import type { DescritorAdaptador } from './descritor.js';
import type { LimitadorDeTaxa } from './limitador.js';
import type { MonitorDeSaude } from './saude.js';
import type { EstadoCircuito } from '@pz/observability';
import type { BulkheadPolicy, CircuitBreakerPolicy, RetryPolicy, TimeoutPolicy } from 'cockatiel';

const logger = criarLogger('integracoes');
const tracer = trace.getTracer('@pz/integracoes');
const sinais = new AsyncLocalStorage<AbortSignal>();

/**
 * Sinal de cancelamento da tentativa em andamento. O adaptador passa ao cliente HTTP/SDK
 * (`fetch(url, { signal: sinalDaChamada() })`) para o timeout cortar a chamada de verdade.
 */
export function sinalDaChamada(): AbortSignal | undefined {
  return sinais.getStore();
}

/** Ajustes da resiliência padrão; os limites do descritor têm precedência. */
export interface PoliticaDeResiliencia {
  readonly tentativas: number;
  readonly atrasoInicialMs: number;
  readonly atrasoMaximoMs: number;
  /** Falhas seguidas que indicam degradação até o circuito abrir. */
  readonly falhasParaAbrir: number;
  /** Tempo com o circuito aberto até testar de novo (meio-aberto). */
  readonly meioAbertoAposMs: number;
  readonly timeoutMs: number;
  readonly concorrencia: number;
  /** Chamadas que esperam vaga no bulkhead; além disso, recusa na hora. */
  readonly filaDeEspera: number;
}

export const POLITICA_PADRAO: PoliticaDeResiliencia = {
  tentativas: 3,
  atrasoInicialMs: 200,
  atrasoMaximoMs: 10_000,
  falhasParaAbrir: 5,
  meioAbertoAposMs: 30_000,
  timeoutMs: 10_000,
  concorrencia: 10,
  filaDeEspera: 100,
};

const ESTADOS: Record<CircuitState, EstadoCircuito> = {
  [CircuitState.Closed]: 'fechado',
  [CircuitState.HalfOpen]: 'meioAberto',
  [CircuitState.Open]: 'aberto',
  [CircuitState.Isolated]: 'aberto',
};
const SAUDE = { fechado: 'operacional', meioAberto: 'degradado', aberto: 'indisponivel' } as const;

/**
 * Resiliência padrão de um adaptador (ADR-005), na ordem:
 * bulkhead → retentativa (backoff exponencial com jitter) → circuit breaker → rate limit
 * distribuído → timeout por tentativa. Cada chamada gera span, métrica de duração e resultado;
 * cada mudança do circuito gera métrica (alerta "integração degradada"), log e saúde.
 */
export class Resiliencia {
  readonly #bulkhead: BulkheadPolicy;
  readonly #retentativa: RetryPolicy;
  readonly #circuito: CircuitBreakerPolicy;
  readonly #timeout: TimeoutPolicy;

  constructor(
    private readonly descritor: DescritorAdaptador,
    private readonly dependencias: {
      readonly saude: MonitorDeSaude;
      readonly limitador?: LimitadorDeTaxa;
      readonly politica?: Partial<PoliticaDeResiliencia>;
    },
  ) {
    const politica = { ...POLITICA_PADRAO, ...dependencias.politica };
    const { limites } = descritor;
    this.#bulkhead = bulkhead(limites.concorrencia ?? politica.concorrencia, politica.filaDeEspera);
    this.#retentativa = retry(
      handleWhen((erro) => erro instanceof ErroIntegracao && erro.retentavel),
      {
        maxAttempts: politica.tentativas - 1,
        backoff: new ExponentialBackoff({
          initialDelay: politica.atrasoInicialMs,
          maxDelay: politica.atrasoMaximoMs,
        }),
      },
    );
    this.#circuito = circuitBreaker(
      handleWhen((erro) => erro instanceof ErroIntegracao && erro.indicaDegradacao),
      {
        halfOpenAfter: politica.meioAbertoAposMs,
        breaker: new ConsecutiveBreaker(politica.falhasParaAbrir),
      },
    );
    this.#timeout = timeout(limites.timeoutMs ?? politica.timeoutMs, TimeoutStrategy.Aggressive);
    this.#circuito.onStateChange((estado) => {
      this.#aoMudarCircuito(ESTADOS[estado]);
    });
    registrarEstadoCircuito(descritor.id, 'fechado');
  }

  #aoMudarCircuito(estado: EstadoCircuito): void {
    const { id } = this.descritor;
    registrarEstadoCircuito(id, estado);
    this.dependencias.saude.estado(id, SAUDE[estado]);
    if (estado === 'aberto') {
      registrarErro(
        logger,
        new Error(`circuito aberto: adaptador ${id} indisponível`),
        `integração ${id} indisponível (circuito aberto)`,
        'integracoes.circuito',
      );
    } else {
      logger.info({ adaptador: id, circuito: estado }, 'circuito da integração mudou de estado');
    }
  }

  /** Executa uma operação remota do adaptador com a resiliência e a telemetria padrão. */
  executar<Resultado>(operacao: string, chamada: () => Promise<Resultado>): Promise<Resultado> {
    const { id, porta } = this.descritor;
    return tracer.startActiveSpan(
      `integracao ${id}.${operacao}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'pz.integracao.adaptador': id,
          'pz.integracao.porta': porta,
          'pz.integracao.operacao': operacao,
        },
      },
      async (span) => {
        const inicio = performance.now();
        try {
          const resultado = await this.#bulkhead.execute(() =>
            this.#retentativa.execute(() => this.#circuito.execute(() => this.#tentativa(chamada))),
          );
          registrarChamadaIntegracao(id, operacao, 'sucesso', (performance.now() - inicio) / 1000);
          this.dependencias.saude.sucesso(id);
          return resultado;
        } catch (bruto) {
          const erro = this.#erroFinal(bruto);
          registrarChamadaIntegracao(id, operacao, 'falha', (performance.now() - inicio) / 1000);
          this.dependencias.saude.falha(id, `${erro.name}: ${erro.message}`);
          span.recordException(erro);
          span.setStatus({ code: SpanStatusCode.ERROR, message: erro.message });
          span.setAttribute('pz.integracao.erro', erro.tipo);
          throw erro;
        } finally {
          span.end();
        }
      },
    );
  }

  async #tentativa<Resultado>(chamada: () => Promise<Resultado>): Promise<Resultado> {
    const { id, limites } = this.descritor;
    try {
      if (limites.requisicoesPorMinuto !== undefined && this.dependencias.limitador !== undefined) {
        await this.dependencias.limitador.aguardarVez(id, limites.requisicoesPorMinuto);
      }
      return await this.#timeout.execute(({ signal }) => sinais.run(signal, chamada));
    } catch (erro) {
      throw this.#classificar(erro);
    }
  }

  /** Converte o que o adaptador lançou para a classificação padrão (vista pelo circuito). */
  #classificar(erro: unknown): ErroIntegracao {
    const { id } = this.descritor;
    if (erro instanceof ErroIntegracao) return erro;
    if (isTaskCancelledError(erro)) {
      return new ErroTransitorio('tempo esgotado na chamada ao provedor', id, { causa: erro });
    }
    // Erro sem classificação é defeito do adaptador: não repete e alerta (nada falha em silêncio).
    registrarErro(logger, erro, `adaptador ${id} lançou erro sem classificação`, 'integracoes');
    return new ErroPermanente('erro não classificado pelo adaptador', id, { causa: erro });
  }

  #erroFinal(erro: unknown): ErroIntegracao {
    const { id } = this.descritor;
    if (erro instanceof ErroIntegracao) return erro;
    if (isBrokenCircuitError(erro)) {
      return new ErroTransitorio(`adaptador ${id} indisponível (circuito aberto)`, id, {
        causa: erro,
      });
    }
    if (isBulkheadRejectedError(erro)) {
      return new ErroLimiteExcedido(`concorrência do adaptador ${id} esgotada`, id, {
        causa: erro,
      });
    }
    return this.#classificar(erro);
  }
}
