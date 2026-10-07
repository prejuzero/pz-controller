import { AggregateRoot, gerarUuidV7 } from '@pz/kernel';

import type { Clock, EventoDominio, Instant, Uuid } from '@pz/kernel';

export const CANAIS = ['email', 'push', 'whatsapp', 'sms'] as const;
export const TIPOS_DE_NOTIFICACAO = ['nova-intimacao', 'lembrete-prazo'] as const;
export type TipoDeNotificacao = (typeof TIPOS_DE_NOTIFICACAO)[number];
export type Canal = (typeof CANAIS)[number];

export interface EstadoDaNotificacao {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly prazoId?: Uuid;
  readonly canal: Canal;
  readonly tipo: TipoDeNotificacao;
  readonly chave: string;
  readonly versaoTemplate: number;
  readonly destinatarios: readonly string[];
  readonly dados: unknown;
  readonly enviadaEm?: Instant;
  readonly idExterno?: string;
}

export type NotificacaoSolicitada = EventoDominio<
  'NotificacaoSolicitada',
  { notificacaoId: Uuid; canal: Canal; tipo: TipoDeNotificacao }
>;

/**
 * Chave de idempotência (HU30): o mesmo tipo, prazo, destinatário, canal e janela geram uma
 * só notificação, por mais que o pedido se repita (reprocessamento, dois consumidores).
 */
export function chaveDeIdempotencia(p: {
  tipo: TipoDeNotificacao;
  prazoId?: Uuid;
  usuarioId: Uuid;
  canal: Canal;
  janela: string;
}): string {
  return [p.tipo, p.prazoId ?? '-', p.usuarioId, p.canal, p.janela].join(':');
}

/** Uma notificação num canal: nasce solicitada, é enviada uma vez (ADR-004). */
export class Notificacao extends AggregateRoot<NotificacaoSolicitada> {
  private constructor(private estadoAtual: EstadoDaNotificacao) {
    super(estadoAtual.id);
  }

  get estado(): EstadoDaNotificacao {
    return this.estadoAtual;
  }

  static restaurar(estado: EstadoDaNotificacao): Notificacao {
    return new Notificacao(estado);
  }

  static solicitar(
    dados: Omit<EstadoDaNotificacao, 'id' | 'chave' | 'enviadaEm' | 'idExterno'> & {
      janela: string;
    },
    relogio: Clock,
  ): Notificacao {
    const { janela, ...resto } = dados;
    const notificacao = new Notificacao({
      ...resto,
      id: gerarUuidV7(relogio),
      chave: chaveDeIdempotencia({ ...resto, janela }),
    });
    notificacao.registrarEvento({
      id: gerarUuidV7(relogio),
      tipo: 'NotificacaoSolicitada',
      versao: 1,
      tenantId: dados.tenantId,
      agregadoId: notificacao.id,
      ocorridoEm: relogio.agora(),
      payload: { notificacaoId: notificacao.id, canal: dados.canal, tipo: dados.tipo },
    });
    return notificacao;
  }

  get enviada(): boolean {
    return this.estadoAtual.enviadaEm !== undefined;
  }

  registrarEnvio(idExterno: string, em: Instant): void {
    this.estadoAtual = { ...this.estadoAtual, idExterno, enviadaEm: em };
  }
}
