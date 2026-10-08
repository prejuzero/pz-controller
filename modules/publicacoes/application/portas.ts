import type { Instant, Uuid } from '@pz/kernel';

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

/** Publicação como o tenant a vê (view `publicacao_do_tenant`). */
export interface PublicacaoDoTenant {
  readonly id: Uuid;
  readonly fonte: string;
  readonly idExterno: string;
  readonly numeroCnj: string | null;
  readonly dataDisponibilizacao: string;
  readonly teor: string;
  readonly urlFonte: string;
  readonly processoId: Uuid | null;
  readonly oabId: Uuid | null;
  readonly recebidaEm: Date;
  readonly capturadoEm: Date;
  readonly lidaEm: Date | null;
  readonly lidaPor: Uuid | null;
  readonly siglaTribunal: string | null;
  readonly tipoComunicacao: string | null;
}

export interface FiltroDePublicacoes {
  readonly novas?: boolean;
  readonly de?: string;
  readonly ate?: string;
  readonly processoId?: Uuid;
  /** Lista do mais novo para o mais antigo; o cursor é o último id da página anterior. */
  readonly antesDe?: Uuid;
  readonly limite: number;
}

/** Leitura das publicações do tenant da transação (só pela view) e marcação de leitura. */
export interface RepositorioDeLeitura<Transacao> {
  listar(transacao: Transacao, filtro: FiltroDePublicacoes): Promise<PublicacaoDoTenant[]>;
  buscar(transacao: Transacao, id: Uuid): Promise<PublicacaoDoTenant | undefined>;
  /** `false` se já estava lida (a primeira leitura vale como indício, não como ciência). */
  marcarLida(transacao: Transacao, id: Uuid, usuarioId: Uuid, em: Instant): Promise<boolean>;
}
