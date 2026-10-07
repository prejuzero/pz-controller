import { z } from 'zod';

/** Catálogo tipado dos tipos de evento da trilha (HU08): tipo novo entra aqui primeiro. */
export const TIPOS_DE_AUDITORIA = [
  'identidade.dispositivo-registrado',
  'identidade.sessao-revogada',
  'identidade.conta-bloqueada',
  'identidade.redefinicao-de-senha-solicitada',
  'identidade.impersonacao-iniciada',
  'identidade.impersonacao-encerrada',
  'administracao.job-morto-reprocessado',
  'prazos.tipo-de-ato-cadastrado',
  'prazos.versao-da-tabela-proposta',
  'prazos.versao-da-tabela-aprovada',
  'calendario.evento-proposto',
  'calendario.evento-aprovado',
  'calendario.evento-revogado',
  'calendario.feriado-local-cadastrado',
  'calendario.feriado-local-revogado',
  'cadastro.advogado-cadastrado',
  'cadastro.perfil-atualizado',
  'cadastro.oab-adicionada',
  'cadastro.oab-removida',
  'cadastro.processo-cadastrado',
  'cadastro.processo-atualizado',
  'cadastro.sigilo-alterado',
  'cadastro.cobertura-alterada',
  'cadastro.cliente-cadastrado',
  'cadastro.cliente-atualizado',
  'cadastro.cliente-removido',
  'identidade.email-verificado',
  'notificacoes.notificacao-rejeitada',
  'ia.sugestao-corrigida',
  'termos.documento-aceito',
  'privacidade.exportacao-solicitada',
  'privacidade.encerramento-solicitado',
  'privacidade.encerramento-cancelado',
  'privacidade.conta-encerrada',
  'privacidade.provas-expurgadas',
  'notificacoes.consentimento-concedido',
  'notificacoes.consentimento-revogado',
  'notificacoes.destino-push-registrado',
  'notificacoes.destino-push-desativado',
] as const;
export const TipoDeAuditoria = z.enum(TIPOS_DE_AUDITORIA);
export type TipoDeAuditoria = z.infer<typeof TipoDeAuditoria>;

export const EntradaDeAuditoria = z
  .object({
    tipo: TipoDeAuditoria,
    entidade: z.string().min(1).max(100),
    entidadeId: z.string().min(1).max(200),
    antes: z.unknown().optional(),
    depois: z.unknown().optional(),
  })
  .strict();
export type EntradaDeAuditoria = z.infer<typeof EntradaDeAuditoria>;

/** Quem e por onde: vem do contexto da requisição ou do evento, nunca do cliente. */
export interface OrigemDaAuditoria {
  readonly canal: 'portal' | 'app' | 'mcp' | 'integrador' | 'evento' | 'sistema';
  readonly usuarioId?: string;
  /** Quem de fato agiu, quando diferente (suporte agindo em nome do usuário). */
  readonly usuarioRealId?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

/**
 * API pública da trilha (ADR-006): registra na transação do chamador, no tenant dela. Se o
 * registro falhar, a transação de negócio falha junto (nada muda sem rastro).
 */
export interface TrilhaDeAuditoria<Transacao> {
  registrar(
    transacao: Transacao,
    entrada: EntradaDeAuditoria,
    origem: OrigemDaAuditoria,
  ): Promise<void>;
}
