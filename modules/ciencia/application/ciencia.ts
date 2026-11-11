import { Conflito, err, gerarUuidV7, NaoAutenticado, NaoEncontrado, ok } from '@pz/kernel';

import { avancar, contaComoCiencia, VALIDADE_DO_TOKEN_MS } from '../domain/estado.js';

import type { CanalDaConfirmacao, EstadoDaCiencia } from '../domain/estado.js';
import type { TrilhaDeAuditoria } from '@pz/auditoria';
import type {
  Clock,
  EventoDominio,
  Instant,
  Outbox,
  Result,
  UnidadeDeTrabalho,
  Uuid,
} from '@pz/kernel';

/** Porta: token aleatório assinado que carrega o tenant (a infra cuida da criptografia). */
export interface TokensDeCiencia {
  emitir(tenantId: Uuid): { readonly token: string; readonly hash: string };
  /** `undefined` se mal formado ou com assinatura inválida (nem chega ao banco). */
  ler(token: string): { readonly tenantId: Uuid; readonly hash: string } | undefined;
}

export interface TokenRegistrado {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly prazoId: Uuid;
  readonly usuarioId: Uuid;
  readonly expiraEm: Instant;
  readonly usadoEm?: Instant;
  readonly revogadoEm?: Instant;
}

export interface Confirmacao {
  readonly usuarioId: Uuid;
  readonly canal: CanalDaConfirmacao;
  readonly em: Instant;
  readonly ip: string;
  readonly userAgent: string;
}

export interface CienciaDoPrazo {
  readonly estado: EstadoDaCiencia;
  readonly confirmacao?: Confirmacao;
}

/** Porta: tokens (só o hash) e estado da ciência por prazo; tenant da transação (RLS). */
export interface RepositorioDeCiencia<Transacao> {
  tokenPorHash(transacao: Transacao, hash: string): Promise<TokenRegistrado | undefined>;
  /** Reemissão: os ativos do mesmo prazo e usuário deixam de valer. */
  revogarAtivos(
    transacao: Transacao,
    prazoId: Uuid,
    usuarioId: Uuid,
    agora: Instant,
  ): Promise<void>;
  inserirToken(transacao: Transacao, token: TokenRegistrado, hash: string): Promise<void>;
  /** Uso único: `false` se outro pedido usou antes (concorrência). */
  usarToken(transacao: Transacao, id: Uuid, agora: Instant, ip: string): Promise<boolean>;
  ciencia(transacao: Transacao, prazoId: Uuid): Promise<CienciaDoPrazo | undefined>;
  gravar(
    transacao: Transacao,
    tenantId: Uuid,
    prazoId: Uuid,
    ciencia: CienciaDoPrazo,
  ): Promise<void>;
}

/** O prazo visto pela ciência (prazos e cadastro, pelas APIs públicas). */
export interface PrazoParaCiencia {
  readonly prazoId: Uuid;
  readonly numeroProcesso: string;
  readonly tipoAto: string;
  /** AAAA-MM-DD; `null` se ainda "a confirmar" sem data. */
  readonly vencimento: string | null;
  readonly status: 'a-confirmar' | 'pendente' | 'cumprido' | 'vencido' | 'cancelado';
}
export type DadosDoPrazo = (prazoId: Uuid) => Promise<PrazoParaCiencia | undefined>;

export type ItemDoLote =
  | {
      readonly prazoId: Uuid;
      readonly situacao: 'confirmada' | 'ja-confirmada';
      readonly confirmadaEm: Instant;
    }
  | { readonly prazoId: Uuid; readonly situacao: 'falhou'; readonly codigo: string };

export interface ResultadoDoLote {
  readonly itens: readonly ItemDoLote[];
  /** Falhas que não são de negócio (banco, rede): o chamador registra e alerta. */
  readonly inesperadas: readonly unknown[];
}

/** Transações simultâneas no lote: 200 confirmações em menos de 3 s sem esgotar o pool. */
const CONCORRENCIA_DO_LOTE = 8;

export type NoTenant = <T>(tenantId: Uuid, trabalho: () => Promise<T>) => Promise<T>;

export type CienciaConfirmada = EventoDominio<
  'CienciaConfirmada',
  { prazoId: Uuid; usuarioId: Uuid; canal: CanalDaConfirmacao; confirmadaEm: string }
>;

export interface ContextoDaRequisicao {
  readonly ip: string;
  readonly userAgent: string;
}

const linkInvalido = () => new NaoAutenticado('ciencia-link-invalido', 'Link de ciência inválido.');

/**
 * Gera o link do e-mail no momento do envio (HU33): o token não fica gravado na notificação, só o
 * hash aqui. Reemitir invalida os links anteriores do mesmo prazo e usuário.
 */
export class EmitirLinkDeCiencia<Transacao> {
  constructor(
    private readonly ciencia: RepositorioDeCiencia<Transacao>,
    private readonly tokens: TokensDeCiencia,
    private readonly urlDoPortal: string,
    private readonly relogio: Clock,
  ) {}

  async executar(
    tx: Transacao,
    p: { tenantId: Uuid; prazoId: Uuid; usuarioId: Uuid },
  ): Promise<string> {
    const agora = this.relogio.agora();
    const { token, hash } = this.tokens.emitir(p.tenantId);
    await this.ciencia.revogarAtivos(tx, p.prazoId, p.usuarioId, agora);
    await this.ciencia.inserirToken(
      tx,
      { id: gerarUuidV7(this.relogio), ...p, expiraEm: agora.maisMs(VALIDADE_DO_TOKEN_MS) },
      hash,
    );
    await this.#avancar(tx, p.tenantId, p.prazoId, 'enviado');
    return new URL(`/ciencia/${token}`, this.urlDoPortal).toString();
  }

  async #avancar(tx: Transacao, tenantId: Uuid, prazoId: Uuid, estado: EstadoDaCiencia) {
    const atual = await this.ciencia.ciencia(tx, prazoId);
    const novo = avancar(atual?.estado ?? 'nao-enviado', estado);
    if (novo !== atual?.estado)
      await this.ciencia.gravar(tx, tenantId, prazoId, { ...atual, estado: novo });
  }
}

/** Indícios (entregue, aberto, visualizado) e o cumprimento: só avançam, nunca confirmam. */
export class RegistrarIndicioDeCiencia<Transacao> {
  constructor(private readonly ciencia: RepositorioDeCiencia<Transacao>) {}

  async executar(
    tx: Transacao,
    p: {
      tenantId: Uuid;
      prazoId: Uuid;
      estado: 'entregue' | 'aberto' | 'visualizado' | 'cumprido';
    },
  ): Promise<EstadoDaCiencia> {
    const atual = await this.ciencia.ciencia(tx, p.prazoId);
    const novo = avancar(atual?.estado ?? 'nao-enviado', p.estado);
    if (novo !== atual?.estado)
      await this.ciencia.gravar(tx, p.tenantId, p.prazoId, { ...atual, estado: novo });
    return novo;
  }
}

/**
 * O prazo aberto no portal ou no app (HU33): indício "visualizado", nunca ciência. Prazo de
 * outro escritório some pela RLS e responde como inexistente.
 */
export class RegistrarVisualizacao<Transacao> {
  constructor(
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly ciencia: RepositorioDeCiencia<Transacao>,
    private readonly prazos: DadosDoPrazo,
  ) {}

  async executar(p: { tenantId: Uuid; prazoId: Uuid }): Promise<Result<void, NaoEncontrado>> {
    const prazo = await this.prazos(p.prazoId);
    if (prazo === undefined)
      return err(new NaoEncontrado('prazo-inexistente', 'Prazo não encontrado.'));
    await this.unidade.executar((tx) =>
      new RegistrarIndicioDeCiencia(this.ciencia).executar(tx, { ...p, estado: 'visualizado' }),
    );
    return ok(undefined);
  }
}

export type SituacaoDoLink = 'valido' | 'usado' | 'expirado' | 'substituido' | 'invalido';

/**
 * GET /v1/ciencia/{token}: só mostra (varredores de link não confirmam nada). Válido, traz o
 * mínimo do prazo (processo, ato, vencimento) para o advogado conferir antes de confirmar.
 */
export class ConsultarLinkDeCiencia<Transacao> {
  constructor(
    private readonly noTenant: NoTenant,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly ciencia: RepositorioDeCiencia<Transacao>,
    private readonly tokens: TokensDeCiencia,
    private readonly prazos: DadosDoPrazo,
    private readonly relogio: Clock,
  ) {}

  async executar(
    token: string,
  ): Promise<{ situacao: SituacaoDoLink; prazo?: PrazoParaCiencia; confirmadaEm?: Instant }> {
    const lido = this.tokens.ler(token);
    if (lido === undefined) return { situacao: 'invalido' };
    return this.noTenant(lido.tenantId, async () => {
      const r = await this.unidade.executar(async (tx) => {
        const registro = await this.ciencia.tokenPorHash(tx, lido.hash);
        return registro === undefined
          ? undefined
          : { registro, ciencia: await this.ciencia.ciencia(tx, registro.prazoId) };
      });
      if (r === undefined) return { situacao: 'invalido' as const };
      const situacao = situacaoDo(r.registro, this.relogio.agora());
      const prazo = await this.prazos(r.registro.prazoId);
      if (prazo === undefined) return { situacao: 'invalido' as const };
      return {
        situacao,
        prazo,
        ...(r.ciencia?.confirmacao === undefined ? {} : { confirmadaEm: r.ciencia.confirmacao.em }),
      };
    });
  }
}

function situacaoDo(t: TokenRegistrado, agora: Instant): SituacaoDoLink {
  if (t.usadoEm !== undefined) return 'usado';
  if (t.revogadoEm !== undefined) return 'substituido';
  if (t.expiraEm.epochMs <= agora.epochMs) return 'expirado';
  return 'valido';
}

export interface ResultadoDaConfirmacao {
  readonly prazoId: Uuid;
  readonly confirmadaEm: Instant;
  /** Já havia ciência: nada novo foi gravado. */
  readonly jaConfirmada: boolean;
}

/**
 * Confirma a ciência (HU33, RF72): só por ação explícita, pelo link (POST com o token) ou por um
 * cliente autenticado; o mesmo núcleo, com o canal na trilha. Auditoria (canal, IP, user agent e
 * horário do servidor) e CienciaConfirmada na mesma transação.
 */
export class ConfirmarCiencia<Transacao> {
  constructor(
    private readonly noTenant: NoTenant,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly ciencia: RepositorioDeCiencia<Transacao>,
    private readonly tokens: TokensDeCiencia,
    private readonly prazos: DadosDoPrazo,
    private readonly trilha: TrilhaDeAuditoria<Transacao>,
    private readonly outbox: Outbox<Transacao>,
    private readonly relogio: Clock,
  ) {}

  async peloLink(
    token: string,
    contexto: ContextoDaRequisicao,
  ): Promise<Result<ResultadoDaConfirmacao, NaoAutenticado | NaoEncontrado | Conflito>> {
    const lido = this.tokens.ler(token);
    if (lido === undefined) return err(linkInvalido());
    return this.noTenant(lido.tenantId, () =>
      this.unidade.executar(async (tx) => {
        const agora = this.relogio.agora();
        const registro = await this.ciencia.tokenPorHash(tx, lido.hash);
        if (registro === undefined) return err(linkInvalido());
        const situacao = situacaoDo(registro, agora);
        if (situacao !== 'valido') {
          return err(
            new NaoAutenticado(`ciencia-link-${situacao}`, 'Este link de ciência não vale mais.'),
          );
        }
        // Uso único também na concorrência: o segundo POST não passa daqui.
        if (!(await this.ciencia.usarToken(tx, registro.id, agora, contexto.ip))) {
          return err(
            new NaoAutenticado('ciencia-link-usado', 'Este link de ciência não vale mais.'),
          );
        }
        return this.#confirmar(tx, {
          tenantId: lido.tenantId,
          prazoId: registro.prazoId,
          usuarioId: registro.usuarioId,
          canal: 'email',
          contexto,
          agora,
        });
      }),
    );
  }

  pelaSessao(
    autor: { tenantId: Uuid; usuarioId: Uuid; canal: 'portal' | 'app' | 'mobile' },
    prazoId: Uuid,
    contexto: ContextoDaRequisicao,
  ): Promise<Result<ResultadoDaConfirmacao, NaoEncontrado | Conflito>> {
    return this.unidade.executar((tx) =>
      this.#confirmar(tx, {
        tenantId: autor.tenantId,
        prazoId,
        usuarioId: autor.usuarioId,
        canal: autor.canal,
        contexto,
        agora: this.relogio.agora(),
      }),
    );
  }

  /**
   * Confirmação em lote (HU34, RF75): cada prazo na própria transação, com o próprio registro na
   * trilha e o próprio evento; a falha de um não impede os outros. Falha inesperada volta à parte
   * para quem chama registrar (nada falha em silêncio).
   */
  async emLote(
    autor: { tenantId: Uuid; usuarioId: Uuid; canal: 'portal' | 'app' | 'mobile' },
    prazoIds: readonly Uuid[],
    contexto: ContextoDaRequisicao,
  ): Promise<ResultadoDoLote> {
    const unicos = [...new Set(prazoIds)];
    const itens: ItemDoLote[] = new Array<ItemDoLote>(unicos.length);
    const inesperadas: unknown[] = [];
    let proximo = 0;
    const trabalhar = async () => {
      while (proximo < unicos.length) {
        const i = proximo++;
        const prazoId = unicos[i];
        if (prazoId === undefined) return;
        try {
          const r = await this.pelaSessao(autor, prazoId, contexto);
          itens[i] = r.ok
            ? {
                prazoId,
                situacao: r.valor.jaConfirmada ? 'ja-confirmada' : 'confirmada',
                confirmadaEm: r.valor.confirmadaEm,
              }
            : { prazoId, situacao: 'falhou', codigo: r.erro.codigo };
        } catch (erro) {
          inesperadas.push(erro);
          itens[i] = { prazoId, situacao: 'falhou', codigo: 'erro-interno' };
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCORRENCIA_DO_LOTE, unicos.length) }, trabalhar),
    );
    return { itens, inesperadas };
  }

  async #confirmar(
    tx: Transacao,
    p: {
      tenantId: Uuid;
      prazoId: Uuid;
      usuarioId: Uuid;
      canal: CanalDaConfirmacao;
      contexto: ContextoDaRequisicao;
      agora: Instant;
    },
  ): Promise<Result<ResultadoDaConfirmacao, NaoEncontrado | Conflito>> {
    const prazo = await this.prazos(p.prazoId);
    if (prazo === undefined)
      return err(new NaoEncontrado('prazo-inexistente', 'Prazo não encontrado.'));
    if (prazo.status === 'cancelado') {
      return err(
        new Conflito('prazo-cancelado', 'O prazo foi cancelado: não há ciência a registrar.'),
      );
    }
    const atual = await this.ciencia.ciencia(tx, p.prazoId);
    if (atual !== undefined && contaComoCiencia(atual.estado)) {
      return ok({
        prazoId: p.prazoId,
        confirmadaEm: atual.confirmacao?.em ?? p.agora,
        jaConfirmada: true,
      });
    }
    const confirmacao: Confirmacao = {
      usuarioId: p.usuarioId,
      canal: p.canal,
      em: p.agora,
      ip: p.contexto.ip,
      userAgent: p.contexto.userAgent.slice(0, 500),
    };
    await this.ciencia.gravar(tx, p.tenantId, p.prazoId, { estado: 'confirmado', confirmacao });
    await this.trilha.registrar(
      tx,
      {
        tipo: 'ciencia.ciencia-confirmada',
        entidade: 'prazo',
        entidadeId: p.prazoId,
        antes: { estado: atual?.estado ?? 'nao-enviado' },
        depois: { estado: 'confirmado', canal: p.canal },
      },
      {
        canal: p.canal === 'email' ? 'portal' : p.canal,
        usuarioId: p.usuarioId,
        ip: p.contexto.ip,
        userAgent: confirmacao.userAgent,
      },
    );
    const evento: CienciaConfirmada = {
      id: gerarUuidV7(this.relogio),
      tipo: 'CienciaConfirmada',
      versao: 1,
      tenantId: p.tenantId,
      agregadoId: p.prazoId,
      ocorridoEm: p.agora,
      payload: {
        prazoId: p.prazoId,
        usuarioId: p.usuarioId,
        canal: p.canal,
        confirmadaEm: p.agora.paraIso(),
      },
    };
    await this.outbox.gravar(tx, [evento]);
    return ok({ prazoId: p.prazoId, confirmadaEm: p.agora, jaConfirmada: false });
  }
}
