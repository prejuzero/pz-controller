import { executarNoTenant } from '@pz/db';
import {
  capturarContextoPropagavel,
  criarLogger,
  executarJob,
  registrarErro,
} from '@pz/observability';
import { Queue, UnrecoverableError, Worker } from 'bullmq';

import { EnvelopeJob, FILAS, filaDlq, idDoJob, montarEnvelope } from './job.js';

import type { DefinicaoJob, Escopo, NomeFila } from './job.js';
import type { Clock, Uuid } from '@pz/kernel';
import type { SituacaoFila } from '@pz/observability';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

const logger = criarLogger('worker.filas');

export interface ContextoDoJob {
  readonly jobId: string;
  readonly tentativa: number;
}

type Tratador = (dados: unknown, contexto: ContextoDoJob) => Promise<void>;

interface Inscricao {
  readonly definicao: DefinicaoJob<unknown>;
  readonly tratar: Tratador;
}

export interface OpcoesFilas {
  readonly redis: Redis;
  readonly relogio: Clock;
  /** Filas processadas por esta instância (WORKER_QUEUES); vazio = todas. */
  readonly filasAtivas: readonly NomeFila[];
  /** Ajustes para testes (ex.: lock curto para simular worker morto). */
  readonly lockDurationMs?: number;
  readonly atrasoBaseMs?: number;
  /** Espera máxima pelos jobs em andamento no desligamento. Padrão: 10 s. */
  readonly limiteEncerramentoMs?: number;
  /** Intervalo mínimo entre logs de erro de conexão da mesma fila. Padrão: 60 s. */
  readonly intervaloErrosMs?: number;
}

/**
 * Runtime das filas (HU10, ADR-004): publica jobs com ID determinístico (a mesma chave nunca
 * gera dois jobs), processa cada job no tenant dele e no trace de origem, aplica retentativa
 * exponencial e manda para a DLQ da fila o que esgotou as tentativas ou é inválido.
 * Processor não tem regra de negócio: o tratador só chama um caso de uso.
 */
export class Filas {
  readonly #filas = new Map<string, Queue>();
  readonly #inscricoes = new Map<string, Inscricao>();
  readonly #workers: Worker[] = [];
  readonly #ultimoErro = new Map<string, { em: number; suprimidos: number }>();

  constructor(private readonly opcoes: OpcoesFilas) {}

  #fila(nome: string): Queue {
    let fila = this.#filas.get(nome);
    if (fila === undefined) {
      fila = new Queue(nome, { connection: this.opcoes.redis });
      this.#filas.set(nome, fila);
    }
    return fila;
  }

  /** Publica um job. Repetir a mesma chave não cria outro job (idempotência). */
  async publicar<Dados>(
    definicao: DefinicaoJob<Dados>,
    dados: Dados,
    escopo: Escopo,
    chave: string,
  ): Promise<string> {
    const envelope = montarEnvelope(definicao, dados, escopo, chave, capturarContextoPropagavel());
    const config = FILAS[definicao.fila];
    const jobId = idDoJob(definicao.tipo, chave);
    await this.#fila(definicao.fila).add(definicao.tipo, envelope, {
      jobId,
      attempts: config.tentativas,
      backoff: { type: 'exponential', delay: this.opcoes.atrasoBaseMs ?? config.atrasoBaseMs },
      removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    });
    return jobId;
  }

  /** Associa um tipo de job ao tratador (que chama um caso de uso). */
  registrar<Dados>(
    definicao: DefinicaoJob<Dados>,
    tratar: (dados: Dados, contexto: ContextoDoJob) => Promise<void>,
  ): void {
    if (this.#inscricoes.has(definicao.tipo))
      throw new Error(`Job ${definicao.tipo} já registrado`);
    this.#inscricoes.set(definicao.tipo, {
      definicao: definicao,
      tratar: tratar as Tratador,
    });
  }

  filasAtivas(): NomeFila[] {
    const todas = Object.keys(FILAS) as NomeFila[];
    return this.opcoes.filasAtivas.length === 0
      ? todas
      : todas.filter((fila) => this.opcoes.filasAtivas.includes(fila));
  }

  /** Começa a consumir as filas ativas. */
  iniciar(): void {
    for (const nome of this.filasAtivas()) {
      const worker = new Worker(nome, (job: Job) => this.#processar(nome, job), {
        connection: this.opcoes.redis,
        concurrency: FILAS[nome].concorrencia,
        ...(this.opcoes.lockDurationMs === undefined
          ? {}
          : {
              lockDuration: this.opcoes.lockDurationMs,
              stalledInterval: this.opcoes.lockDurationMs,
            }),
      });
      worker.on('failed', (job, erro) => {
        if (job === undefined) return;
        this.#aoFalhar(nome, job, erro).catch((falha: unknown) => {
          // Perder um job morto seria falha silenciosa: vira log, métrica e alerta.
          registrarErro(
            logger,
            falha,
            `falha ao mover o job ${String(job.id)} para a DLQ`,
            'worker.filas.dlq',
          );
        });
      });
      worker.on('error', (erro) => {
        this.#registrarErroDeConexao(nome, erro);
      });
      this.#workers.push(worker);
    }
    logger.info({ filas: this.filasAtivas() }, 'filas em processamento');
  }

  /**
   * Com o Redis fora, o BullMQ emite um erro a cada tentativa de reconexão. Registra no máximo
   * um por fila por intervalo, com a contagem dos suprimidos: a falha continua visível (log,
   * métrica, alerta e prontidão 503) sem inundar logs e Sentry.
   */
  #registrarErroDeConexao(nome: NomeFila, erro: Error): void {
    const agora = performance.now();
    const anterior = this.#ultimoErro.get(nome);
    if (anterior !== undefined && agora - anterior.em < (this.opcoes.intervaloErrosMs ?? 60_000)) {
      anterior.suprimidos += 1;
      return;
    }
    registrarErro(
      logger,
      erro,
      `erro no worker da fila ${nome}${anterior?.suprimidos ? ` (+${String(anterior.suprimidos)} suprimidos)` : ''}`,
      'worker.filas',
    );
    this.#ultimoErro.set(nome, { em: agora, suprimidos: 0 });
  }

  async #processar(nome: NomeFila, job: Job): Promise<void> {
    const envelope = EnvelopeJob.safeParse(job.data);
    if (!envelope.success) throw new UnrecoverableError('envelope do job inválido');
    const inscricao = this.#inscricoes.get(envelope.data.tipo);
    if (inscricao === undefined) {
      throw new UnrecoverableError(`nenhum tratador para o job ${envelope.data.tipo}`);
    }
    const dados = inscricao.definicao.dados.safeParse(envelope.data.dados);
    if (!dados.success) throw new UnrecoverableError(`dados inválidos para ${envelope.data.tipo}`);

    const { escopo, contexto } = envelope.data;
    const jobId = job.id ?? idDoJob(envelope.data.tipo, envelope.data.chave);
    const tenantId = 'tenantId' in escopo ? escopo.tenantId : undefined;
    const executar = () =>
      executarJob({ fila: nome, jobId, tenantId: tenantId ?? 'global', contexto }, () =>
        inscricao.tratar(dados.data, { jobId, tentativa: job.attemptsMade + 1 }),
      );
    await (tenantId === undefined ? executar() : executarNoTenant(tenantId as Uuid, executar));
  }

  async #aoFalhar(nome: NomeFila, job: Job, erro: Error): Promise<void> {
    // Retentativas vão para "delayed"; só a falha final (ou irrecuperável) fica em "failed".
    if (!(await job.isFailed())) {
      // Toda tentativa que falha fica visível, não só a última (nada falha em silêncio).
      logger.warn(
        {
          fila: nome,
          jobId: job.id,
          tipo: job.name,
          tentativa: job.attemptsMade,
          erro: erro.message,
        },
        'tentativa de job falhou; nova tentativa agendada',
      );
      return;
    }
    await this.#fila(filaDlq(nome)).add(
      'morto',
      {
        fila: nome,
        jobId: job.id,
        tipo: job.name,
        dados: job.data as unknown,
        erro: erro.message,
        tentativas: job.attemptsMade,
        falhouEm: this.opcoes.relogio.agora().paraIso(),
      },
      // ID com prefixo: o BullMQ recusa IDs customizados numéricos (jobs sem ID próprio).
      { jobId: `${nome}-${String(job.id)}`, removeOnComplete: false },
    );
    registrarErro(
      logger,
      erro,
      `job ${String(job.id)} da fila ${nome} foi para a DLQ`,
      'worker.filas.dlq',
    );
  }

  /** Profundidade, idade do job mais antigo e DLQ de cada fila ativa (métricas e alertas). */
  async situacao(): Promise<SituacaoFila[]> {
    const agora = this.opcoes.relogio.agora().epochMs;
    return Promise.all(
      this.filasAtivas().map(async (nome) => {
        const fila = this.#fila(nome);
        const [contagem, maisAntigo, dlq] = await Promise.all([
          fila.getJobCounts('wait'),
          fila.getJobs(['wait'], 0, 0, true),
          this.#fila(filaDlq(nome)).getJobCounts('wait'),
        ]);
        const criadoEm = maisAntigo[0]?.timestamp;
        return {
          fila: nome,
          aguardando: contagem.wait ?? 0,
          idadeMaisAntigoSegundos:
            criadoEm === undefined ? 0 : Math.max(0, (agora - criadoEm) / 1000),
          dlq: dlq.wait ?? 0,
        };
      }),
    );
  }

  /**
   * Para de pegar jobs novos e espera os em andamento terminarem, até o limite; passado o limite
   * (ex.: Redis fora do ar), força o fechamento para o processo não ficar preso no desligamento.
   * Um job interrompido assim volta para a fila quando o lock expira e é retomado por outra réplica.
   */
  async encerrar(limiteMs = this.opcoes.limiteEncerramentoMs ?? 10_000): Promise<void> {
    let temporizador: NodeJS.Timeout | undefined;
    const esgotou = new Promise<'esgotou'>((resolver) => {
      temporizador = setTimeout(() => {
        resolver('esgotou');
      }, limiteMs);
    });
    const gracioso = Promise.all(this.#workers.map((worker) => worker.close())).then(
      () => 'ok' as const,
    );
    const resultado = await Promise.race([gracioso, esgotou]);
    clearTimeout(temporizador);
    if (resultado === 'esgotou') {
      logger.warn({ limiteMs }, 'encerramento das filas passou do limite: fechando à força');
      // Até o close(true) pode esperar o processador travado: dispara e não espera mais que 1 s.
      await Promise.race([
        Promise.all(this.#workers.map((worker) => worker.close(true).catch(() => undefined))),
        new Promise((resolver) => setTimeout(resolver, 1_000)),
      ]);
      this.opcoes.redis.disconnect();
      return;
    }
    await Promise.all([...this.#filas.values()].map((fila) => fila.close()));
  }
}
