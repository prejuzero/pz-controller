import { AggregateRoot, gerarUuidV7 } from '@pz/kernel';

import type { Canal } from './notificacao.js';
import type { Clock, EventoDominio, Instant, Uuid } from '@pz/kernel';

/**
 * Canais que exigem consentimento registrado por usuário (HU30, ADR-015). O e-mail fica fora:
 * é o canal do serviço contratado (prazos, ciência, segurança) e segue essa base legal.
 */
export const CANAIS_COM_CONSENTIMENTO = ['push', 'whatsapp', 'sms'] as const;
export type CanalComConsentimento = (typeof CANAIS_COM_CONSENTIMENTO)[number];
export const ORIGENS_DO_CONSENTIMENTO = ['portal', 'app', 'mcp', 'integrador'] as const;
export type OrigemDoConsentimento = (typeof ORIGENS_DO_CONSENTIMENTO)[number];

export const exigeConsentimento = (canal: Canal): canal is CanalComConsentimento =>
  (CANAIS_COM_CONSENTIMENTO as readonly string[]).includes(canal);

export interface EstadoDoConsentimento {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly canal: CanalComConsentimento;
  /** Push: ID do dispositivo; WhatsApp e SMS: telefone E.164. */
  readonly destino: string;
  readonly concedidoEm: Instant;
  readonly revogadoEm?: Instant;
  readonly origem: OrigemDoConsentimento;
}

/** Sem o destino: telefone é dado pessoal e não precisa circular nos eventos. */
export type ConsentimentoCanalAlterado = EventoDominio<
  'ConsentimentoCanalAlterado',
  {
    consentimentoId: Uuid;
    usuarioId: Uuid;
    canal: CanalComConsentimento;
    situacao: 'concedido' | 'revogado';
  }
>;

/** Consentimento de um usuário para um canal e destino; revogar encerra, nunca apaga. */
export class ConsentimentoCanal extends AggregateRoot<ConsentimentoCanalAlterado> {
  private constructor(private estadoAtual: EstadoDoConsentimento) {
    super(estadoAtual.id);
  }

  get estado(): EstadoDoConsentimento {
    return this.estadoAtual;
  }

  get ativo(): boolean {
    return this.estadoAtual.revogadoEm === undefined;
  }

  static restaurar(estado: EstadoDoConsentimento): ConsentimentoCanal {
    return new ConsentimentoCanal(estado);
  }

  static conceder(
    dados: Omit<EstadoDoConsentimento, 'id' | 'concedidoEm' | 'revogadoEm'>,
    relogio: Clock,
  ): ConsentimentoCanal {
    const consentimento = new ConsentimentoCanal({
      ...dados,
      id: gerarUuidV7(relogio),
      concedidoEm: relogio.agora(),
    });
    consentimento.#alterado('concedido', relogio);
    return consentimento;
  }

  /** Idempotente: já revogado não muda nem gera evento. Devolve se houve mudança. */
  revogar(relogio: Clock): boolean {
    if (!this.ativo) return false;
    this.estadoAtual = { ...this.estadoAtual, revogadoEm: relogio.agora() };
    this.#alterado('revogado', relogio);
    return true;
  }

  #alterado(situacao: 'concedido' | 'revogado', relogio: Clock): void {
    const { id, tenantId, usuarioId, canal } = this.estadoAtual;
    this.registrarEvento({
      id: gerarUuidV7(relogio),
      tipo: 'ConsentimentoCanalAlterado',
      versao: 1,
      tenantId,
      agregadoId: id,
      ocorridoEm: relogio.agora(),
      payload: { consentimentoId: id, usuarioId, canal, situacao },
    });
  }
}
