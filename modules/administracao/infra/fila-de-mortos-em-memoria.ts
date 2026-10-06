import type { FilaDeMortos } from '../application/reprocessar-job-morto.js';
import type { JobMorto } from '../domain/job-morto.js';

/** DLQ em memória para os testes (sem Redis). */
export class FilaDeMortosEmMemoria implements FilaDeMortos {
  readonly #mortos = new Map<string, JobMorto>();
  readonly reprocessados: JobMorto[] = [];
  falharAoReprocessar = false;

  morrer(job: JobMorto): void {
    this.#mortos.set(`${job.fila}/${job.jobId}`, job);
  }

  buscar(fila: string, jobId: string): Promise<JobMorto | undefined> {
    return Promise.resolve(this.#mortos.get(`${fila}/${jobId}`));
  }

  reprocessar(job: JobMorto): Promise<void> {
    if (this.falharAoReprocessar) return Promise.reject(new Error('Redis indisponível'));
    this.#mortos.delete(`${job.fila}/${job.jobId}`);
    this.reprocessados.push(job);
    return Promise.resolve();
  }
}
