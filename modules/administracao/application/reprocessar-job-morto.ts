import { Conflito, err, NaoEncontrado, ok } from '@pz/kernel';

import { resumoParaAuditoria } from '../domain/job-morto.js';

import type { JobMorto } from '../domain/job-morto.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type { Result, UnidadeDeTrabalho } from '@pz/kernel';

/** Porta: as DLQs das filas de trabalho. */
export interface FilaDeMortos {
  buscar(fila: string, jobId: string): Promise<JobMorto | undefined>;
  /**
   * Devolve o job original à fila de origem com as tentativas zeradas e o tira da DLQ. Lança se
   * não conseguir: a transação do chamador desfaz a auditoria.
   */
  reprocessar(job: JobMorto): Promise<void>;
}

export interface PedidoDeReprocessamento {
  readonly fila: string;
  readonly jobId: string;
  readonly motivo: string;
  readonly usuarioId: string;
  readonly ip: string;
  readonly userAgent: string;
}

export interface DependenciasDoReprocessamento<Transacao> {
  readonly filaDeMortos: FilaDeMortos;
  readonly unidade: UnidadeDeTrabalho<Transacao>;
  readonly trilha: TrilhaDeAuditoria<Transacao>;
}

/**
 * Reprocessa um job da DLQ (HU07, herdado da HU10) com auditoria no tenant da requisição (o da
 * plataforma: só o admin da plataforma tem `admin:filas`). A auditoria vem antes e o job só
 * volta à fila dentro da mesma transação: se a fila falhar, a auditoria é desfeita.
 */
export class ReprocessarJobMorto<Transacao> {
  constructor(private readonly deps: DependenciasDoReprocessamento<Transacao>) {}

  async executar(pedido: PedidoDeReprocessamento): Promise<Result<void, NaoEncontrado | Conflito>> {
    const job = await this.deps.filaDeMortos.buscar(pedido.fila, pedido.jobId);
    if (job === undefined) {
      return err(new NaoEncontrado('job-morto-inexistente', 'Job não encontrado na DLQ.'));
    }
    if (!job.originalDisponivel) {
      return err(
        new Conflito(
          'job-original-indisponivel',
          'O job original não está mais na fila como falho; não há o que reprocessar.',
        ),
      );
    }
    await this.deps.unidade.executar(async (tx) => {
      await this.deps.trilha.registrar(
        tx,
        {
          tipo: 'administracao.job-morto-reprocessado',
          entidade: 'job',
          entidadeId: `${job.fila}/${job.jobId}`,
          antes: resumoParaAuditoria(job, pedido.motivo),
        },
        {
          canal: 'portal',
          usuarioId: pedido.usuarioId,
          ip: pedido.ip,
          userAgent: pedido.userAgent,
        },
      );
      await this.deps.filaDeMortos.reprocessar(job);
    });
    return ok(undefined);
  }
}
