import { err, gerarUuidV7, NaoEncontrado, ok } from '@pz/kernel';

import { eventoDoPrazo } from '../domain/agenda.js';
import { gerarIcs } from '../domain/ics.js';

import type { PrazoDaAgenda } from '../domain/agenda.js';
import type { OrigemDaAuditoria, TrilhaDeAuditoria } from '@pz/auditoria';
import type { Clock, Instant, Result, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** Quem usa a agenda (HU50): o escritório e o usuário vêm da sessão ou do token do feed. */
export interface UsuarioDaAgenda {
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
}

/**
 * Prazos abertos (pendentes e a confirmar) com vencimento, do usuário e os sem responsável
 * (decisão do usuário em 09/11/2026), já com o nome do ato e o processo. Composta na api pelas
 * APIs públicas de busca, prazos e cadastro, no tenant do usuário.
 */
export interface FonteDaAgenda {
  prazosAbertos(usuario: UsuarioDaAgenda): Promise<readonly PrazoDaAgenda[]>;
}

export interface FeedDaAgenda {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly usuarioId: Uuid;
  readonly criadoEm: Instant;
  readonly ultimoAcesso: Instant | null;
}

/** Feeds no tenant da transação (RLS); `localizar` atravessa tenants pela função restrita. */
export interface RepositorioDeFeeds<Transacao> {
  ativo(transacao: Transacao, usuarioId: Uuid): Promise<FeedDaAgenda | undefined>;
  criar(transacao: Transacao, feed: FeedDaAgenda, tokenHash: string): Promise<void>;
  /** `false` se o usuário não tinha feed ativo. */
  revogarAtivo(transacao: Transacao, usuarioId: Uuid, em: Instant): Promise<boolean>;
  registrarAcesso(transacao: Transacao, id: Uuid, em: Instant): Promise<void>;
  /** Sem tenant (a agenda chega sem sessão): só o necessário de um feed, pelo hash. */
  localizar(
    tokenHash: string,
  ): Promise<{ id: Uuid; tenantId: Uuid; usuarioId: Uuid; ativo: boolean } | undefined>;
}

/** Token do feed: aleatório, mostrado uma vez; no banco só o hash (CLAUDE.md, seção 14). */
export interface TokensDoFeed {
  novo(): string;
  hash(token: string): string;
}

export type NoTenantDaAgenda = <R>(tenantId: Uuid, trabalho: () => Promise<R>) => Promise<R>;

export const NOME_DO_CALENDARIO = 'PrejuZero · prazos';

/** O .ics do usuário (download no portal e o feed): mínimo de dados, datas do motor. */
export class GerarAgendaIcs {
  constructor(
    private readonly fonte: FonteDaAgenda,
    private readonly relogio: Clock,
    private readonly portalUrl: string,
  ) {}

  async executar(usuario: UsuarioDaAgenda): Promise<string> {
    const prazos = await this.fonte.prazosAbertos(usuario);
    return gerarIcs({
      nome: NOME_DO_CALENDARIO,
      geradoEm: this.relogio.agora(),
      eventos: prazos.map((p) => eventoDoPrazo(p, this.portalUrl)),
    });
  }
}

export class ConsultarFeedDaAgenda<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly feeds: RepositorioDeFeeds<Transacao>,
  ) {}

  executar(usuarioId: Uuid): Promise<FeedDaAgenda | undefined> {
    return this.unidade.executar((tx) => this.feeds.ativo(tx, usuarioId));
  }
}

/**
 * Cria o endereço de assinatura (revogando o anterior, se houver): o token só aparece aqui. A
 * agenda pessoal fica em servidor de terceiros, então a criação fica na trilha.
 */
export class CriarFeedDaAgenda<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly feeds: RepositorioDeFeeds<Transacao>,
    private readonly tokens: TokensDoFeed,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async executar(
    usuario: UsuarioDaAgenda & { readonly canal: OrigemDaAuditoria['canal'] },
  ): Promise<{ readonly token: string; readonly feed: FeedDaAgenda }> {
    const token = this.tokens.novo();
    const agora = this.relogio.agora();
    const feed: FeedDaAgenda = {
      id: gerarUuidV7(this.relogio),
      tenantId: usuario.tenantId,
      usuarioId: usuario.usuarioId,
      criadoEm: agora,
      ultimoAcesso: null,
    };
    await this.unidade.executar(async (tx) => {
      const substituiu = await this.feeds.revogarAtivo(tx, usuario.usuarioId, agora);
      await this.feeds.criar(tx, feed, this.tokens.hash(token));
      await this.trilha.registrar(
        tx,
        {
          tipo: 'relatorios.feed-agenda-criado',
          entidade: 'feed_agenda',
          entidadeId: feed.id,
          depois: { substituiuAnterior: substituiu },
        },
        { canal: usuario.canal, usuarioId: usuario.usuarioId },
      );
    });
    return { token, feed };
  }
}

export class RevogarFeedDaAgenda<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly feeds: RepositorioDeFeeds<Transacao>,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly relogio: Clock,
  ) {}

  executar(
    usuario: UsuarioDaAgenda & { readonly canal: OrigemDaAuditoria['canal'] },
  ): Promise<Result<void, NaoEncontrado>> {
    return this.unidade.executar(async (tx) => {
      const feed = await this.feeds.ativo(tx, usuario.usuarioId);
      if (feed === undefined) {
        return err(new NaoEncontrado('feed-inexistente', 'Não há agenda assinada.'));
      }
      await this.feeds.revogarAtivo(tx, usuario.usuarioId, this.relogio.agora());
      await this.trilha.registrar(
        tx,
        { tipo: 'relatorios.feed-agenda-revogado', entidade: 'feed_agenda', entidadeId: feed.id },
        { canal: usuario.canal, usuarioId: usuario.usuarioId },
      );
      return ok(undefined);
    });
  }
}

/**
 * Leitura do feed pela agenda (sem sessão): token revogado, de escritório suspenso ou de
 * usuário desativado não lê nada. Cada leitura atualiza o último acesso (sem trilha: a agenda
 * consulta de hora em hora).
 */
export class LerFeedDaAgenda<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly feeds: RepositorioDeFeeds<Transacao>,
    private readonly tokens: TokensDoFeed,
    private readonly noTenant: NoTenantDaAgenda,
    private readonly gerar: GerarAgendaIcs,
    private readonly relogio: Clock,
  ) {}

  async executar(token: string): Promise<Result<string, NaoEncontrado>> {
    const feed = await this.feeds.localizar(this.tokens.hash(token));
    if (feed?.ativo !== true) {
      return err(new NaoEncontrado('feed-inexistente', 'Agenda não encontrada.'));
    }
    return this.noTenant(feed.tenantId, async () => {
      await this.unidade.executar((tx) =>
        this.feeds.registrarAcesso(tx, feed.id, this.relogio.agora()),
      );
      return ok(await this.gerar.executar({ tenantId: feed.tenantId, usuarioId: feed.usuarioId }));
    });
  }
}
