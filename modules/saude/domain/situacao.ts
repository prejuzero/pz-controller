import { AggregateRoot, gerarUuidV7 } from '@pz/kernel';

import type { Clock, EventoDominio, Instant, Uuid } from '@pz/kernel';

export type Situacao = 'operacional' | 'degradada';

export interface ResultadoVerificacao {
  readonly dependencia: string;
  readonly disponivel: boolean;
  readonly latenciaMs: number;
  readonly motivo?: string;
}

/** A plataforma só está operacional se todas as dependências responderem. */
export function avaliarSituacao(resultados: readonly ResultadoVerificacao[]): Situacao {
  return resultados.every((resultado) => resultado.disponivel) ? 'operacional' : 'degradada';
}

export type SituacaoVerificada = EventoDominio<'SituacaoVerificada', { situacao: Situacao }>;

/** Registro de uma verificação da situação, que publica `SituacaoVerificada` (contrato v1). */
export class VerificacaoDeSituacao extends AggregateRoot<SituacaoVerificada> {
  private constructor(
    id: Uuid,
    readonly tenantId: Uuid,
    readonly situacao: Situacao,
    readonly verificadaEm: Instant,
  ) {
    super(id);
  }

  static registrar(
    tenantId: Uuid,
    resultados: readonly ResultadoVerificacao[],
    relogio: Clock,
  ): VerificacaoDeSituacao {
    const verificacao = new VerificacaoDeSituacao(
      gerarUuidV7(relogio),
      tenantId,
      avaliarSituacao(resultados),
      relogio.agora(),
    );
    verificacao.registrarEvento({
      id: gerarUuidV7(relogio),
      tipo: 'SituacaoVerificada',
      versao: 1,
      tenantId,
      agregadoId: verificacao.id,
      ocorridoEm: verificacao.verificadaEm,
      payload: { situacao: verificacao.situacao },
    });
    return verificacao;
  }
}
