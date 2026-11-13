import type { JanelaDaCaptura, TipoDeAlvo } from '../domain/alvo.js';
import type { EstadoDaFonte, SituacaoDaFonte } from '../domain/fonte.js';
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
  /** Alvo ativo com assinante e a próxima execução mais antiga (sonda da fonte degradada). */
  sonda(transacao: Transacao): Promise<AlvoDevido | undefined>;
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
  /** Estado da fonte sem travar (fonte nunca vista: operacional, sem falhas). */
  estadoDaFonte(transacao: Transacao, fonte: string): Promise<EstadoDaFonte>;
  /** Trava a linha da fonte (criando-a se preciso) até o fim da transação e devolve o estado. */
  travarFonte(transacao: Transacao, fonte: string): Promise<EstadoDaFonte>;
  /** Grava o estado; `desde` só quando a situação mudou. */
  gravarFonte(
    transacao: Transacao,
    fonte: string,
    estado: EstadoDaFonte,
    desde?: Instant,
  ): Promise<void>;
  /** Tenants com alguma assinatura (afetados por uma mudança na fonte). */
  tenantsAssinantes(transacao: Transacao): Promise<Uuid[]>;
  /**
   * Recaptura (HU19): todo alvo ativo em recuo passa a ser devido agora. A janela de cada um vai
   * do último sucesso até hoje, então nenhum dia da indisponibilidade fica sem captura.
   */
  anteciparAlvos(transacao: Transacao, agora: Instant): Promise<number>;
  /** Alvo ativo pelo id, sem travar (busca manual planejada a partir do pedido). */
  alvoPorId(transacao: Transacao, alvoId: Uuid): Promise<AlvoDevido | undefined>;
  /** Próxima rodada agendada da captura da fonte (criando a linha da fonte se preciso). */
  gravarProximaRodada(transacao: Transacao, fonte: string, quando: Instant | null): Promise<void>;
}

/** Alvo de uma OAB do escritório, travado para o pedido de busca manual. */
export interface AlvoDaBusca {
  readonly alvoId: Uuid;
  readonly oab: string;
  readonly ultimoPedido?: Instant;
}

/**
 * Porta: pedido de "buscar agora" no tenant da transação. A OAB chega pela assinatura (RLS); o
 * alvo, global, é travado para dois pedidos simultâneos não passarem pelo intervalo mínimo.
 */
export interface RepositorioDaBuscaAgora<Transacao> {
  travarAlvoDaOab(transacao: Transacao, oabId: Uuid): Promise<AlvoDaBusca | undefined>;
  registrarPedido(transacao: Transacao, alvoId: Uuid, em: Instant): Promise<void>;
}

/**
 * Porta: alertas à equipe (métrica, log e alerta), implementada na composição. Os escritórios
 * afetados são avisados por eventos de domínio (FonteDegradada e FonteRestabelecida).
 */
export interface AlertasDaCaptura {
  fonteDegradada(fonte: string, falhas: number): void;
  fonteRestabelecida(fonte: string, alvosAntecipados: number): void;
  alvoFalhando(alvoId: Uuid, falhas: number): void;
}

/** Status da captura de uma OAB do escritório (GET /v1/captura/status). */
export interface StatusDaOab {
  readonly oabId: Uuid;
  readonly oab: string;
  readonly ultimoSucesso: Instant | null;
  readonly proximaExecucao: Instant | null;
  readonly falhasConsecutivas: number;
  /** Último pedido de "buscar agora" da OAB (de qualquer escritório: o alvo é um só). */
  readonly ultimoPedido: Instant | null;
}

export interface SituacaoPublicaDaFonte {
  readonly id: string;
  readonly situacao: SituacaoDaFonte;
  readonly desde: Instant | null;
  /** Próxima rodada agendada da captura (o worker grava a cada rodada e no boot). */
  readonly proximaRodada: Instant | null;
}

/** Porta: leitura do status no tenant da transação (assinaturas pela RLS; alvo e fonte globais). */
export interface LeituraDoStatus<Transacao> {
  oabs(transacao: Transacao): Promise<StatusDaOab[]>;
  fonte(transacao: Transacao, fonte: string): Promise<SituacaoPublicaDaFonte>;
}
