import { filaDlq, NOMES_FILAS } from '@pz/integracoes';
import { Queue } from 'bullmq';
import { z } from 'zod';

import type { ContadorDeFilas, ResumoDeFila } from '../application/painel.js';
import type { FilaDeMortos } from '../application/reprocessar-job-morto.js';
import type { JobMorto } from '../domain/job-morto.js';
import type { NomeFila } from '@pz/integracoes';
import type { ConnectionOptions } from 'bullmq';

/** O que o worker grava na DLQ (apps/worker, filas/runtime.ts). Validado: vem do Redis. */
const DadosDoMorto = z.object({
  fila: z.string(),
  jobId: z.string(),
  tipo: z.string(),
  erro: z.string(),
  tentativas: z.number().int().nonnegative(),
  falhouEm: z.string(),
});

function ehFila(nome: string): nome is NomeFila {
  return (NOMES_FILAS as readonly string[]).includes(nome);
}

/** DLQs no BullMQ. Também entrega as filas ao painel (Bull Board), que só lê. */
export class FilaDeMortosBullMq implements FilaDeMortos, ContadorDeFilas {
  readonly #filas = new Map<string, Queue>();

  constructor(private readonly conexao: ConnectionOptions) {}

  #fila(nome: string): Queue {
    let fila = this.#filas.get(nome);
    if (fila === undefined) {
      fila = new Queue(nome, { connection: this.conexao });
      this.#filas.set(nome, fila);
    }
    return fila;
  }

  /** Todas as filas do catálogo e as DLQs, para o painel. */
  todas(): Queue[] {
    return NOMES_FILAS.flatMap((nome) => [this.#fila(nome), this.#fila(filaDlq(nome))]);
  }

  /** Contagem por fila do catálogo, com a DLQ (só leitura). */
  async resumo(): Promise<ResumoDeFila[]> {
    return Promise.all(
      NOMES_FILAS.map(async (nome) => {
        const [contagem, mortos] = await Promise.all([
          this.#fila(nome).getJobCounts('wait', 'active', 'delayed', 'failed'),
          this.#fila(filaDlq(nome)).getJobCountByTypes(
            'wait',
            'waiting-children',
            'delayed',
            'prioritized',
          ),
        ]);
        return {
          fila: nome,
          aguardando: contagem.wait ?? 0,
          ativos: contagem.active ?? 0,
          atrasados: contagem.delayed ?? 0,
          falhos: contagem.failed ?? 0,
          mortos,
        };
      }),
    );
  }

  async buscar(fila: string, jobId: string): Promise<JobMorto | undefined> {
    if (!ehFila(fila)) return undefined;
    // O worker grava o morto com o ID prefixado pela fila (runtime.ts).
    const morto = await this.#fila(filaDlq(fila)).getJob(`${fila}-${jobId}`);
    if (morto === undefined) return undefined;
    const dados = DadosDoMorto.parse(morto.data);
    const original = await this.#fila(fila).getJob(jobId);
    return {
      ...dados,
      originalDisponivel: original !== undefined && (await original.isFailed()),
    };
  }

  async reprocessar(job: JobMorto): Promise<void> {
    if (!ehFila(job.fila)) throw new Error(`Fila desconhecida: ${job.fila}`);
    const original = await this.#fila(job.fila).getJob(job.jobId);
    if (original === undefined) throw new Error(`Job ${job.jobId} sumiu da fila ${job.fila}`);
    // Tentativas zeradas: o job ganha a política de retentativa inteira de novo.
    await original.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
    await this.#fila(filaDlq(job.fila)).remove(`${job.fila}-${job.jobId}`);
  }

  async fechar(): Promise<void> {
    await Promise.all([...this.#filas.values()].map((fila) => fila.close()));
  }
}
