import type {
  Documento,
  Formato,
  PrazoDoRelatorio,
  PublicacaoDoRelatorio,
  SituacaoDoRelatorio,
  TipoDeRelatorio,
} from '../domain/relatorio.js';
import type { Instant, Result, Uuid, Validacao } from '@pz/kernel';

export interface Relatorio {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly tipo: TipoDeRelatorio;
  readonly formato: Formato;
  readonly filtros: Readonly<Record<string, unknown>>;
  readonly situacao: SituacaoDoRelatorio;
  readonly linhas?: number;
  readonly solicitadoEm: Instant;
  readonly concluidoEm?: Instant;
  readonly expiraEm?: Instant;
}

/** Pedidos de relatório no tenant da transação (RLS). */
export interface RepositorioDeRelatorios<Transacao> {
  inserir(transacao: Transacao, relatorio: Relatorio): Promise<void>;
  buscar(transacao: Transacao, id: Uuid): Promise<Relatorio | undefined>;
  recentes(transacao: Transacao, usuarioId: Uuid, limite: number): Promise<Relatorio[]>;
  concluir(
    transacao: Transacao,
    id: Uuid,
    conclusao: { em: Instant; expiraEm: Instant; linhas: number },
  ): Promise<void>;
  falhar(transacao: Transacao, id: Uuid): Promise<void>;
}

export interface CienciaDoPrazoNoRelatorio {
  readonly confirmadaEm?: Instant;
  readonly canal?: string;
  readonly enviadas: number;
  readonly entregues: number;
  readonly rejeitadas: number;
}

export interface Pagina<T> {
  readonly itens: readonly T[];
  readonly proximoCursor: string | null;
}

/**
 * Porta: as buscas da HU28 (módulo busca, na composição), com os mesmos filtros e a mesma ordem
 * da tela; assim o relatório bate com a busca de origem. Roda no tenant do job.
 */
export interface FonteDosRelatorios {
  prazos(filtros: Record<string, unknown>): Promise<Result<Pagina<PrazoDoRelatorio>, Validacao>>;
  publicacoes(
    filtros: Record<string, unknown>,
  ): Promise<Result<Pagina<PublicacaoDoRelatorio>, Validacao>>;
  /** Um prazo do tenant (envio manual, HU32), com o número do processo; `undefined` se não existe. */
  prazo(id: Uuid): Promise<{ prazo: PrazoDoRelatorio; numeroProcesso?: string } | undefined>;
  publicacao(id: Uuid): Promise<PublicacaoDoRelatorio | undefined>;
  /** Ciência e notificações dos prazos (controle de ciência, HU34); sem linha = nada registrado. */
  controleDeCiencia(
    prazoIds: readonly string[],
  ): Promise<ReadonlyMap<string, CienciaDoPrazoNoRelatorio>>;
  /** Nome de quem pediu, para o cabeçalho. */
  nomeDoUsuario(usuarioId: Uuid): Promise<string>;
}

/** Renderizador plugável (ADR-005 no espírito): um por formato. */
export interface Renderizador {
  readonly formato: Formato;
  readonly tipoMime: string;
  renderizar(documento: Documento): Promise<Uint8Array>;
}
