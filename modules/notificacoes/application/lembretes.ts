import { gerarUuidV7 } from '@pz/kernel';

import {
  ANTECEDENCIAS_DA_INSISTENCIA,
  ANTECEDENCIAS_PADRAO,
  normalizarAntecedencias,
  planejarLembretes,
} from '../domain/lembrete.js';

import type { Notificar } from './notificacoes.js';
import type { PreferenciasDeNotificacao } from './portas.js';
import type { LembretePlanejado, TipoDeLembrete } from '../domain/lembrete.js';
import type { Clock, Instant, LocalDate, UnidadeDeTrabalho, Uuid } from '@pz/kernel';

/** O prazo visto pelos lembretes (módulo prazos, pela API pública dele). */
export interface PrazoParaLembrete {
  readonly prazoId: Uuid;
  readonly processoId: Uuid;
  readonly responsavelId: Uuid | null;
  readonly statusCiencia: 'pendente' | 'confirmada';
  readonly vencimento: LocalDate | null;
  /** Aberto e com vencimento. */
  readonly lembrar: boolean;
}

/** Porta: situação do prazo e datas dos lembretes (o motor conta os dias úteis). */
export interface AgendaDoPrazo {
  situacao(prazoId: Uuid): Promise<PrazoParaLembrete | undefined>;
  datas(
    processoId: Uuid,
    vencimento: LocalDate,
    antecedencias: readonly number[],
  ): Promise<readonly { readonly antecedencia: number; readonly data: LocalDate }[]>;
}

/** Porta: número do processo para o e-mail (cadastro, pela API pública dele). */
export type NumeroDoProcesso = (processoId: Uuid) => Promise<string | undefined>;

export interface LembreteAgendado {
  readonly id: Uuid;
  readonly tenantId: Uuid;
  readonly prazoId: Uuid;
  readonly usuarioId: Uuid;
  readonly tipo: TipoDeLembrete;
  readonly antecedencia: number;
  readonly vencimento: LocalDate;
  readonly disparoEm: Instant;
}

export type DesfechoDoLembrete = 'enviado' | 'cancelado' | 'dispensado';

/** Porta: agenda materializada (tabela `lembrete_agendado`, RLS; sem DELETE). */
export interface RepositorioDeLembretes<Transacao> {
  /** Cancela os agendados do prazo e grava os novos. */
  substituir(
    transacao: Transacao,
    prazoId: Uuid,
    novos: readonly LembreteAgendado[],
    agora: Instant,
  ): Promise<void>;
  cancelarDoPrazo(transacao: Transacao, prazoId: Uuid, agora: Instant): Promise<number>;
  /** Como sistema (sem RLS): tenants com lembrete devido. */
  tenantsComDevidos(transacao: Transacao, agora: Instant): Promise<Uuid[]>;
  /** Devidos do tenant, travados para esta transação (outras réplicas pulam: SKIP LOCKED). */
  devidos(transacao: Transacao, agora: Instant, limite: number): Promise<LembreteAgendado[]>;
  marcar(
    transacao: Transacao,
    id: Uuid,
    desfecho: DesfechoDoLembrete,
    agora: Instant,
  ): Promise<void>;
  /** Prazos com lembrete agendado do usuário (para reprogramar ao mudar a preferência). */
  prazosDoUsuario(transacao: Transacao, usuarioId: Uuid): Promise<Uuid[]>;
}

/**
 * Programa (ou reprograma) os lembretes de um prazo (HU31): no PrazoSugerido, Confirmado, Ajustado
 * e Recalculado e quando a preferência muda. Prazo fechado, sem vencimento ou sem responsável não
 * tem lembrete. Idempotente: repetir regrava a mesma agenda.
 */
export class ProgramarLembretes<Transacao> {
  constructor(
    private readonly lembretes: RepositorioDeLembretes<Transacao>,
    private readonly preferencias: PreferenciasDeNotificacao<Transacao>,
    private readonly agenda: AgendaDoPrazo,
    private readonly relogio: Clock,
  ) {}

  async executar(
    transacao: Transacao,
    tenantId: Uuid,
    prazoId: Uuid,
  ): Promise<{ agendados: number }> {
    const agora = this.relogio.agora();
    const prazo = await this.agenda.situacao(prazoId);
    if (prazo?.lembrar !== true || prazo.vencimento === null || prazo.responsavelId === null) {
      await this.lembretes.cancelarDoPrazo(transacao, prazoId, agora);
      return { agendados: 0 };
    }
    const usuarioId = prazo.responsavelId;
    const escolhidas = normalizarAntecedencias(
      (await this.preferencias.antecedencias(transacao, usuarioId)) ?? ANTECEDENCIAS_PADRAO,
    );
    const datas = await this.agenda.datas(
      prazo.processoId,
      prazo.vencimento,
      normalizarAntecedencias([...escolhidas, ...ANTECEDENCIAS_DA_INSISTENCIA]),
    );
    const vencimento = prazo.vencimento;
    const novos = planejarLembretes({ vencimento, datas, escolhidas, agora }).map(
      (l: LembretePlanejado): LembreteAgendado => ({
        id: gerarUuidV7(this.relogio),
        tenantId,
        prazoId,
        usuarioId,
        ...l,
      }),
    );
    await this.lembretes.substituir(transacao, prazoId, novos, agora);
    return { agendados: novos.length };
  }
}

/** Cancela os lembretes futuros (PrazoCumprido, PrazoCancelado). */
export class CancelarLembretes<Transacao> {
  constructor(
    private readonly lembretes: RepositorioDeLembretes<Transacao>,
    private readonly relogio: Clock,
  ) {}

  executar(transacao: Transacao, prazoId: Uuid): Promise<number> {
    return this.lembretes.cancelarDoPrazo(transacao, prazoId, this.relogio.agora());
  }
}

/** Executa um trabalho no tenant (contexto da sessão do banco), na composição. */
export type NoTenant = <T>(tenantId: Uuid, trabalho: () => Promise<T>) => Promise<T>;

const LOTE = 100;

const dataBr = (data: LocalDate) => {
  const [ano, mes, dia] = data.paraIso().split('-');
  return `${dia ?? ''}/${mes ?? ''}/${ano ?? ''}`;
};

/**
 * Dispara os lembretes devidos (job a cada minuto, HU31). Confere o prazo na hora: fechado ou com
 * outro vencimento, o lembrete é cancelado (a reprogramação já gravou o novo); insistência com a
 * ciência confirmada é dispensada. Várias réplicas: SKIP LOCKED no lote e a chave da notificação.
 */
export class DispararLembretes<Transacao> {
  constructor(
    private readonly sistema: UnidadeDeTrabalho<Transacao>,
    private readonly noTenant: NoTenant,
    private readonly unidade: UnidadeDeTrabalho<Transacao>,
    private readonly lembretes: RepositorioDeLembretes<Transacao>,
    private readonly agenda: AgendaDoPrazo,
    private readonly numero: NumeroDoProcesso,
    private readonly notificar: Notificar<Transacao>,
    private readonly urlDoPortal: string,
    private readonly relogio: Clock,
  ) {}

  async executar(): Promise<Record<DesfechoDoLembrete, number>> {
    const agora = this.relogio.agora();
    const contagem: Record<DesfechoDoLembrete, number> = {
      enviado: 0,
      cancelado: 0,
      dispensado: 0,
    };
    const tenants = await this.sistema.executar((tx) =>
      this.lembretes.tenantsComDevidos(tx, agora),
    );
    for (const tenantId of tenants) {
      await this.noTenant(tenantId, () =>
        this.unidade.executar(async (tx) => {
          for (const l of await this.lembretes.devidos(tx, agora, LOTE)) {
            const desfecho = await this.#disparar(tx, l);
            await this.lembretes.marcar(tx, l.id, desfecho, agora);
            contagem[desfecho]++;
          }
        }),
      );
    }
    return contagem;
  }

  async #disparar(tx: Transacao, l: LembreteAgendado): Promise<DesfechoDoLembrete> {
    const prazo = await this.agenda.situacao(l.prazoId);
    if (
      prazo?.lembrar !== true ||
      prazo.vencimento === null ||
      !prazo.vencimento.igual(l.vencimento) ||
      prazo.responsavelId !== l.usuarioId
    ) {
      return 'cancelado';
    }
    if (l.tipo === 'insistencia' && prazo.statusCiencia === 'confirmada') return 'dispensado';
    const numeroProcesso = (await this.numero(prazo.processoId)) ?? 'sem número';
    const r = await this.notificar.executar(tx, {
      tipo: 'lembrete-prazo',
      tenantId: l.tenantId,
      usuarioId: l.usuarioId,
      prazoId: l.prazoId,
      janela: l.disparoEm.paraIso(),
      dados: {
        numeroProcesso,
        vencimento: dataBr(l.vencimento),
        link: new URL(`/prazos/${l.prazoId}`, this.urlDoPortal).toString(),
      },
    });
    // Dados que o template recusa são defeito: nada falha em silêncio (o job vai para a DLQ).
    if (!r.ok) throw r.erro;
    return 'enviado';
  }
}

/**
 * E-mail de nova intimação com o prazo sugerido (HU31, RF63): no PrazoSugerido de uma publicação
 * (origem DJEN), para o responsável. "Confirmar ciência" entra com a HU33.
 */
export class AvisarNovaIntimacao<Transacao> {
  constructor(
    private readonly agenda: AgendaDoPrazo,
    private readonly numero: NumeroDoProcesso,
    private readonly notificar: Notificar<Transacao>,
    private readonly urlDoPortal: string,
  ) {}

  async executar(
    transacao: Transacao,
    p: { tenantId: Uuid; prazoId: Uuid; origem: 'djen' | 'manual' | 'painel' },
  ): Promise<'avisado' | 'sem-aviso'> {
    if (p.origem !== 'djen') return 'sem-aviso';
    const prazo = await this.agenda.situacao(p.prazoId);
    if (prazo === undefined || prazo.responsavelId === null) return 'sem-aviso';
    const r = await this.notificar.executar(transacao, {
      tipo: 'nova-intimacao',
      tenantId: p.tenantId,
      usuarioId: prazo.responsavelId,
      prazoId: p.prazoId,
      janela: 'nova',
      dados: {
        numeroProcesso: (await this.numero(prazo.processoId)) ?? 'sem número',
        link: new URL(`/prazos/${p.prazoId}`, this.urlDoPortal).toString(),
      },
    });
    if (!r.ok) throw r.erro;
    return r.valor.solicitada ? 'avisado' : 'sem-aviso';
  }
}
