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
  /** Todas as versões, inclusive as agendadas: a numeração não pode se repetir. */
  todos(transacao: Transacao): Promise<DocumentoLegal[]>;
  /** Grava a nova versão (imutável). `false` se o tipo já tem essa versão (corrida). */
  inserir(transacao: Transacao, documento: DocumentoLegal): Promise<boolean>;
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
