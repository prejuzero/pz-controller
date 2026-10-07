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
