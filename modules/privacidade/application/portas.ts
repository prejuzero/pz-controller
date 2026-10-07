import type { Encerramento } from '../domain/encerramento.js';
import type { EscopoDeExportacao, SecaoExportada } from '../domain/exportacao.js';
import type { Instant, Uuid } from '@pz/kernel';

/**
 * Porta: dados de um módulo para a exportação (HU38). Cada módulo implementa sobre as próprias
 * tabelas (no tenant da transação) e a composição junta as fontes; ninguém lê tabela alheia.
 * Segredos (hash de senha, TOTP, tokens) nunca entram.
 */
export interface FonteDeExportacao<Transacao> {
  titular(transacao: Transacao, usuarioId: Uuid): Promise<SecaoExportada[]>;
  escritorio(transacao: Transacao): Promise<SecaoExportada[]>;
}

export const SITUACOES_DA_EXPORTACAO = ['pendente', 'concluida'] as const;
export type SituacaoDaExportacao = (typeof SITUACOES_DA_EXPORTACAO)[number];

export interface Exportacao {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly escopo: EscopoDeExportacao;
  readonly situacao: SituacaoDaExportacao;
  readonly solicitadaEm: Instant;
  readonly concluidaEm?: Instant;
  readonly expiraEm?: Instant;
}

/** Pedidos de exportação no tenant da transação (RLS). */
export interface RepositorioDeExportacoes<Transacao> {
  inserir(transacao: Transacao, exportacao: Exportacao): Promise<void>;
  buscar(transacao: Transacao, id: Uuid): Promise<Exportacao | undefined>;
  /** Pedido ainda pendente do mesmo usuário e escopo (evita pedidos repetidos). */
  pendente(
    transacao: Transacao,
    usuarioId: Uuid,
    escopo: EscopoDeExportacao,
  ): Promise<Exportacao | undefined>;
  concluir(transacao: Transacao, id: Uuid, em: Instant, expiraEm: Instant): Promise<void>;
}

/** Pedido de encerramento no tenant da transação (RLS); um por tenant. */
export interface RepositorioDeEncerramentos<Transacao> {
  buscar(transacao: Transacao, tenantId: Uuid): Promise<Encerramento | undefined>;
  /** Grava o pedido (substitui um pedido cancelado). */
  salvarPedido(transacao: Transacao, tenantId: Uuid, encerramento: Encerramento): Promise<void>;
  cancelar(transacao: Transacao, tenantId: Uuid, em: Instant): Promise<void>;
}

/** Operações da efetivação, que atravessam tenants (papel sistema, com motivo). */
export interface OperacoesDeEncerramento<Transacao> {
  vencidos(transacao: Transacao, agora: Instant): Promise<Uuid[]>;
  /** Define o tenant da transação do sistema (a trilha de auditoria registra nele). */
  entrarNoTenant(transacao: Transacao, tenantId: Uuid): Promise<void>;
  usuariosDoTenant(transacao: Transacao, tenantId: Uuid): Promise<Uuid[]>;
  exportacoesDoTenant(transacao: Transacao, tenantId: Uuid): Promise<Uuid[]>;
  /** Apaga os dados de negócio e pseudonimiza as provas (função do banco, só com pedido vencido). */
  efetivar(transacao: Transacao, tenantId: Uuid): Promise<void>;
}

/** Porta: encerra as sessões ativas do usuário (módulo identidade, na composição). */
export interface EncerradorDeSessoes {
  removerTodasDoUsuario(usuarioId: Uuid): Promise<void>;
}
