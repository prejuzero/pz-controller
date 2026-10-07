import type { JanelaDaCaptura, TipoDeAlvo } from '../domain/alvo.js';
import type { Instant, LocalDate, Uuid } from '@pz/kernel';

/** Alvo pronto para executar: ativo, com assinante e fora do recuo de falhas. */
export interface AlvoDevido {
  readonly id: Uuid;
  readonly tipo: TipoDeAlvo;
  readonly valor: string;
  readonly ultimaJanelaFim?: LocalDate;
}

/** Alvo travado para a entrega da captura, com os tenants que o assinam. */
export interface AlvoParaEntrega {
  readonly id: Uuid;
  readonly tipo: TipoDeAlvo;
  readonly valor: string;
  readonly ultimaChave?: string;
  readonly falhasConsecutivas: number;
  readonly assinantes: readonly { tenantId: Uuid; referencias: readonly Uuid[] }[];
}

/**
 * Porta: alvos e assinaturas no tenant do evento (consumidores). O alvo é global; a assinatura,
 * do tenant da transação (RLS).
 */
export interface RepositorioDeAssinaturas<Transacao> {
  /** Cria o alvo se não existir (corrida resolvida pelo índice único) e devolve o id. */
  obterOuCriarAlvo(
    transacao: Transacao,
    tipo: TipoDeAlvo,
    valor: string,
    idNovo: Uuid,
  ): Promise<Uuid>;
  /** Idempotente: assinar de novo não duplica. */
  assinar(transacao: Transacao, alvoId: Uuid, tenantId: Uuid, referencia: Uuid): Promise<void>;
  /** Idempotente: sem assinatura, não faz nada. */
  desassinar(
    transacao: Transacao,
    tipo: TipoDeAlvo,
    valor: string,
    tenantId: Uuid,
    referencia: Uuid,
  ): Promise<void>;
}

/** Porta: planejamento e entrega, que atravessam tenants (papel sistema, com motivo). */
export interface RepositorioDaCaptura<Transacao> {
  devidos(transacao: Transacao, agora: Instant): Promise<AlvoDevido[]>;
  /** Trava o alvo (FOR UPDATE) até o fim da transação. */
  travar(transacao: Transacao, alvoId: Uuid): Promise<AlvoParaEntrega | undefined>;
  registrarSucesso(
    transacao: Transacao,
    alvoId: Uuid,
    em: Instant,
    janela: JanelaDaCaptura,
    chave: string,
  ): Promise<void>;
  registrarFalha(
    transacao: Transacao,
    alvoId: Uuid,
    falhas: number,
    proximaExecucao: Instant,
  ): Promise<void>;
}
