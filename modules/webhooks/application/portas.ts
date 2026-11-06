import type { EventoPublico } from '../domain/eventos-publicos.js';
import type { Instant, Uuid } from '@pz/kernel';

export interface Assinatura {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly url: string;
  readonly descricao: string;
  readonly eventos: readonly EventoPublico[];
  readonly segredoCifrado: string;
  readonly criadoPor: Uuid;
  readonly criadoEm: Instant;
  readonly desativadaEm: Instant | null;
}

export type SituacaoDaEntrega = 'pendente' | 'entregue' | 'falhou';

export interface Entrega {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly assinaturaId: Uuid;
  readonly eventoId: Uuid;
  readonly tipo: string;
  readonly ocorridoEm: Instant;
  readonly dados: Readonly<Record<string, string | null>>;
  readonly situacao: SituacaoDaEntrega;
  readonly tentativas: number;
  readonly ultimoStatus: number | null;
  readonly ultimoErro: string | null;
  readonly entregueEm: Instant | null;
  readonly criadoEm: Instant;
}

/** Assinaturas do tenant da transação (tabela `assinatura_webhook`, RLS, sem DELETE). */
export interface RepositorioDeAssinaturas<Transacao> {
  inserir(transacao: Transacao, assinatura: Assinatura): Promise<void>;
  listar(transacao: Transacao): Promise<Assinatura[]>;
  buscar(transacao: Transacao, id: Uuid): Promise<Assinatura | undefined>;
  /** `false` se não existe ou já estava desativada. */
  desativar(transacao: Transacao, id: Uuid, agora: Instant): Promise<boolean>;
  ativasDoEvento(transacao: Transacao, tipo: EventoPublico): Promise<Assinatura[]>;
}

export interface TentativaDeEntrega {
  readonly situacao: SituacaoDaEntrega;
  readonly status: number | null;
  readonly erro: string | null;
  readonly agora: Instant;
  /** Envio de fato (soma em `tentativas`); esgotar só muda a situação. */
  readonly enviou: boolean;
}

/** Entregas do tenant da transação (tabela `entrega_webhook`, RLS, sem DELETE). */
export interface RepositorioDeEntregas<Transacao> {
  /** `false` quando a assinatura já tem entrega para o evento (idempotência). */
  inserirSeNova(transacao: Transacao, entrega: Entrega): Promise<boolean>;
  buscar(transacao: Transacao, id: Uuid): Promise<Entrega | undefined>;
  registrarTentativa(transacao: Transacao, id: Uuid, tentativa: TentativaDeEntrega): Promise<void>;
  /** Volta uma entrega que falhou para pendente; `false` se não falhou. */
  reabrir(transacao: Transacao, id: Uuid): Promise<boolean>;
  /** Mais recentes primeiro. */
  listar(
    transacao: Transacao,
    filtro: { readonly assinaturaId?: Uuid; readonly limite: number },
  ): Promise<Entrega[]>;
}

/** HMAC-SHA256 em hexadecimal e o segredo aleatório da assinatura. */
export interface Criptografia {
  novoSegredo(): string;
  hmac(segredo: string, mensagem: string): string;
}

/** Cifra do segredo (ADR-021): ele é lido para assinar, então não pode ser só hash. */
export interface CifraDoSegredo {
  cifrar(texto: string): string;
  decifrar(cifrado: string): string;
}

export interface Autor {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly canal: 'portal' | 'app' | 'mcp' | 'integrador';
}
