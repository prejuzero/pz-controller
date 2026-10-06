/** Job que esgotou as tentativas (ou era inválido) e está na DLQ da fila de origem (HU10). */
export interface JobMorto {
  readonly fila: string;
  /** ID do job na fila de origem. */
  readonly jobId: string;
  readonly tipo: string;
  readonly erro: string;
  readonly tentativas: number;
  readonly falhouEm: string;
  /**
   * O job original ainda está na fila de origem como falho. Sem ele não há o que reprocessar:
   * a fila apaga os falhos depois de 30 dias.
   */
  readonly originalDisponivel: boolean;
}

/** O que vai para a trilha: identifica o job e a falha, sem os dados do job (podem ser sigilosos). */
export function resumoParaAuditoria(job: JobMorto, motivo: string) {
  return {
    fila: job.fila,
    jobId: job.jobId,
    tipo: job.tipo,
    erro: job.erro,
    tentativas: job.tentativas,
    falhouEm: job.falhouEm,
    motivo,
  };
}
