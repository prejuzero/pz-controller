import type { Aceite, DocumentoLegal } from '../domain/documento.js';
import type { Instant, Uuid } from '@pz/kernel';

/** Porta: unidade de trabalho no tenant informado (o guarda da API roda antes do contexto). */
export interface UnidadeNoTenant<Transacao> {
  executar<Resultado>(
    tenantId: Uuid,
    trabalho: (transacao: Transacao) => Promise<Resultado>,
  ): Promise<Resultado>;
}

export interface RepositorioDeDocumentos<Transacao> {
  publicadosAte(transacao: Transacao, ate: Instant): Promise<DocumentoLegal[]>;
  buscar(transacao: Transacao, id: Uuid): Promise<DocumentoLegal | undefined>;
}

export interface NovoAceite {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly documentoId: Uuid;
  readonly aceitoEm: Instant;
  readonly ip: string;
  readonly userAgent: string;
}

/** Aceites no tenant da transação (RLS); só inserção. */
export interface RepositorioDeAceites<Transacao> {
  aceitosPor(transacao: Transacao, usuarioId: Uuid): Promise<Aceite[]>;
  /** `false` se o usuário já aceitou este documento. */
  registrar(transacao: Transacao, aceite: NovoAceite): Promise<boolean>;
}
