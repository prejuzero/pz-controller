import { AggregateRoot, gerarUuidV7 } from '@pz/kernel';

import type { Clock, EventoDominio, Instant, Uuid } from '@pz/kernel';

export const CANAIS = ['email', 'push', 'whatsapp', 'sms'] as const;
export const TIPOS_DE_NOTIFICACAO = [
  'nova-intimacao',
  'lembrete-prazo',
  'resumo-diario',
  'prazo-recalculado',
  'ciencia-confirmada',
  'email-rejeitado',
  'envio-manual',
] as const;
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
  readonly entregueEm?: Instant;
  readonly abertaEm?: Instant;
  readonly rejeitadaEm?: Instant;
  readonly motivoRejeicao?: string;
}

/** Desfecho informado pelo provedor (webhook de entrega), já no modelo canônico. */
export interface DesfechoDeEntrega {
  readonly tipo: 'entregue' | 'aberto' | 'clicado' | 'rejeitado' | 'reclamacao' | 'falhou';
  readonly ocorridoEm: Instant;
  readonly motivo?: string | undefined;
}

/** Por que a notificação não chegou: endereço inexistente, marcada como spam ou falha do envio. */
export type MotivoDeRejeicao = 'bounce' | 'spam' | 'falha';

export type NotificacaoSolicitada = EventoDominio<
  'NotificacaoSolicitada',
  { notificacaoId: Uuid; canal: Canal; tipo: TipoDeNotificacao }
>;
export type NotificacaoEntregue = EventoDominio<
  'NotificacaoEntregue',
  { notificacaoId: Uuid; usuarioId: Uuid; canal: Canal; tipo: TipoDeNotificacao }
>;
export type NotificacaoRejeitada = EventoDominio<
  'NotificacaoRejeitada',
  {
    notificacaoId: Uuid;
    usuarioId: Uuid;
    canal: Canal;
    tipo: TipoDeNotificacao;
    motivo: MotivoDeRejeicao;
    detalhe?: string;
  }
>;
type EventoDaNotificacao = NotificacaoSolicitada | NotificacaoEntregue | NotificacaoRejeitada;

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
export class Notificacao extends AggregateRoot<EventoDaNotificacao> {
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
    dados: Omit<
      EstadoDaNotificacao,
      | 'id'
      | 'chave'
      | 'enviadaEm'
      | 'idExterno'
      | 'entregueEm'
      | 'abertaEm'
      | 'rejeitadaEm'
      | 'motivoRejeicao'
    > & {
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

  /**
   * Aplica o desfecho do provedor (HU30). Idempotente: o mesmo desfecho repetido não muda nada
   * nem gera evento de novo. Devolve se houve mudança.
   */
  registrarDesfecho(desfecho: DesfechoDeEntrega, relogio: Clock): boolean {
    const e = this.estadoAtual;
    switch (desfecho.tipo) {
      case 'entregue': {
        if (e.entregueEm !== undefined) return false;
        this.estadoAtual = { ...e, entregueEm: desfecho.ocorridoEm };
        const { evento, payload } = this.#base(relogio);
        this.registrarEvento({ ...evento, tipo: 'NotificacaoEntregue', payload });
        return true;
      }
      case 'aberto':
      case 'clicado':
        if (e.abertaEm !== undefined) return false;
        this.estadoAtual = { ...e, abertaEm: desfecho.ocorridoEm };
        return true;
      default: {
        if (e.rejeitadaEm !== undefined) return false;
        const motivo = MOTIVOS[desfecho.tipo];
        const detalhe = desfecho.motivo?.slice(0, 500);
        this.estadoAtual = {
          ...e,
          rejeitadaEm: desfecho.ocorridoEm,
          motivoRejeicao: detalhe === undefined ? motivo : `${motivo}: ${detalhe}`,
        };
        const { evento, payload } = this.#base(relogio);
        this.registrarEvento({
          ...evento,
          tipo: 'NotificacaoRejeitada',
          payload: { ...payload, motivo, ...(detalhe === undefined ? {} : { detalhe }) },
        });
        return true;
      }
    }
  }

  #base(relogio: Clock) {
    const { id, tenantId, usuarioId, canal, tipo } = this.estadoAtual;
    return {
      evento: {
        id: gerarUuidV7(relogio),
        versao: 1,
        tenantId,
        agregadoId: id,
        ocorridoEm: relogio.agora(),
      },
      payload: { notificacaoId: id, usuarioId, canal, tipo },
    };
  }
}

/** Rejeição permanente e reclamação suprimem o endereço; falha do envio não (HU30). */
const MOTIVOS: Record<'rejeitado' | 'reclamacao' | 'falhou', MotivoDeRejeicao> = {
  rejeitado: 'bounce',
  reclamacao: 'spam',
  falhou: 'falha',
};
