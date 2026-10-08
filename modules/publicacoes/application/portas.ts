import type { Uuid } from '@pz/kernel';

/** Conteúdo registrado (ou já existente) para uma publicação capturada. */
export interface ConteudoRegistrado {
  readonly conteudoId: Uuid;
  readonly capturadoEm: Date;
  readonly novo: boolean;
}

export interface PublicacaoParaRegistrar {
  readonly id: Uuid;
  readonly fonte: string;
  readonly idExterno: string;
  readonly hashConteudo: string;
  readonly dataDisponibilizacao: string;
  readonly numeroCnj: string | null;
  readonly teor: string;
  readonly urlFonte: string;
  readonly metadados: Record<string, unknown>;
  readonly adaptadorVersao: string;
}

export interface NovoDestinatario {
  readonly tenantId: Uuid;
  readonly conteudoId: Uuid;
  readonly capturadoEm: Date;
  readonly processoId: Uuid | null;
  readonly oabId: Uuid | null;
}

/** Porta: conteúdo global (pela função do banco) e destinatários do tenant da transação. */
export interface RepositorioDePublicacoes<Transacao> {
  registrarConteudo(
    transacao: Transacao,
    publicacao: PublicacaoParaRegistrar,
  ): Promise<ConteudoRegistrado>;
  /** `false` se o tenant já tinha recebido o conteúdo (idempotente). */
  registrarDestinatario(transacao: Transacao, destinatario: NovoDestinatario): Promise<boolean>;
}

/** Porta: processo do número no tenant, criado se não existe (módulo cadastro na composição). */
export type ObterOuCriarProcessoNoTenant = (tenantId: Uuid, numeroCnj: string) => Promise<Uuid>;
