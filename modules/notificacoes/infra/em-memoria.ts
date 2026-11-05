import { ConsentimentoCanal } from '../domain/consentimento.js';
import { situacaoDoEnvio } from '../domain/envio.js';
import { Notificacao } from '../domain/notificacao.js';

import type {
  DesfechoDoLembrete,
  LembreteAgendado,
  RepositorioDeLembretes,
} from '../application/lembretes.js';
import type {
  DestinoPushNovo,
  PreferenciasDeNotificacao,
  RepositorioDeConsentimentos,
  RepositorioDeDestinosPush,
  RepositorioDeEnvios,
  RepositorioDeNotificacoes,
} from '../application/portas.js';
import type {
  PreferenciasDoUsuario,
  RepositorioDePreferencias,
} from '../application/preferencias.js';
import type { ConsultaDeSupressoes, Supressao } from '../application/supressoes.js';
import type { CanalComConsentimento, EstadoDoConsentimento } from '../domain/consentimento.js';
import type { EnvioRecente, RecursoDoEnvio } from '../domain/envio.js';
import type { EstadoDaNotificacao, TipoDeNotificacao } from '../domain/notificacao.js';
import type { Instant, TransacaoEmMemoria, Uuid } from '@pz/kernel';

/** Notificações em memória, com a chave de idempotência única do Postgres. Só para testes. */
export class NotificacoesEmMemoria implements RepositorioDeNotificacoes<TransacaoEmMemoria> {
  readonly #porId = new Map<Uuid, EstadoDaNotificacao>();
  /** Escritas ainda não confirmadas, visíveis na própria transação (como no Postgres). */
  readonly #naTransacao = new WeakMap<TransacaoEmMemoria, Map<Uuid, EstadoDaNotificacao>>();

  todas(): EstadoDaNotificacao[] {
    return [...this.#porId.values()];
  }

  inserir(tx: TransacaoEmMemoria, notificacao: Notificacao): Promise<boolean> {
    if (this.todas().some((n) => n.chave === notificacao.estado.chave))
      return Promise.resolve(false);
    tx.aoConfirmar(() => this.#porId.set(notificacao.id, notificacao.estado));
    return Promise.resolve(true);
  }

  buscar(_tx: TransacaoEmMemoria, id: Uuid): Promise<Notificacao | undefined> {
    const estado = this.#porId.get(id);
    return Promise.resolve(estado === undefined ? undefined : Notificacao.restaurar(estado));
  }

  registrarEnvio(tx: TransacaoEmMemoria, notificacao: Notificacao): Promise<void> {
    tx.aoConfirmar(() => this.#porId.set(notificacao.id, notificacao.estado));
    return Promise.resolve();
  }

  buscarPorIdExterno(tx: TransacaoEmMemoria, idExterno: string): Promise<Notificacao | undefined> {
    const visiveis = new Map([...this.#porId, ...(this.#naTransacao.get(tx) ?? [])]);
    const estado = [...visiveis.values()].find((n) => n.idExterno === idExterno);
    return Promise.resolve(estado === undefined ? undefined : Notificacao.restaurar(estado));
  }

  registrarDesfecho(tx: TransacaoEmMemoria, notificacao: Notificacao): Promise<void> {
    let pendentes = this.#naTransacao.get(tx);
    if (pendentes === undefined) {
      pendentes = new Map();
      this.#naTransacao.set(tx, pendentes);
    }
    pendentes.set(notificacao.id, notificacao.estado);
    return this.registrarEnvio(tx, notificacao);
  }

  usuariosComRejeicaoDesde(_tx: TransacaoEmMemoria, desde: Instant): Promise<number> {
    const usuarios = this.todas()
      .filter((n) => n.rejeitadaEm !== undefined && !n.rejeitadaEm.ehAntesDe(desde))
      .map((n) => n.usuarioId);
    return Promise.resolve(new Set(usuarios).size);
  }
}

/** Consentimentos e destinos de push em memória, com o "um ativo por destino" do Postgres. */
export class ConsentimentosEmMemoria
  implements
    RepositorioDeConsentimentos<TransacaoEmMemoria>,
    RepositorioDeDestinosPush<TransacaoEmMemoria>
{
  readonly #consentimentos = new Map<Uuid, EstadoDoConsentimento>();
  readonly #push = new Map<Uuid, DestinoPushNovo & { id: Uuid; ativo: boolean }>();

  ativos(_tx: TransacaoEmMemoria, usuarioId: Uuid): Promise<ConsentimentoCanal[]> {
    return Promise.resolve(
      [...this.#consentimentos.values()]
        .filter((c) => c.usuarioId === usuarioId && c.revogadoEm === undefined)
        .map((c) => ConsentimentoCanal.restaurar(c)),
    );
  }

  buscar(_tx: TransacaoEmMemoria, id: Uuid): Promise<ConsentimentoCanal | undefined> {
    const c = this.#consentimentos.get(id);
    return Promise.resolve(c === undefined ? undefined : ConsentimentoCanal.restaurar(c));
  }

  inserir(tx: TransacaoEmMemoria, consentimento: ConsentimentoCanal): Promise<boolean> {
    const e = consentimento.estado;
    const repetido = [...this.#consentimentos.values()].some(
      (c) =>
        c.usuarioId === e.usuarioId &&
        c.canal === e.canal &&
        c.destino === e.destino &&
        c.revogadoEm === undefined,
    );
    if (repetido) return Promise.resolve(false);
    tx.aoConfirmar(() => this.#consentimentos.set(e.id, e));
    return Promise.resolve(true);
  }

  registrarRevogacao(tx: TransacaoEmMemoria, consentimento: ConsentimentoCanal): Promise<void> {
    tx.aoConfirmar(() => this.#consentimentos.set(consentimento.id, consentimento.estado));
    return Promise.resolve();
  }

  async enderecos(
    tx: TransacaoEmMemoria,
    usuarioId: Uuid,
    canal: CanalComConsentimento,
  ): Promise<readonly string[]> {
    const destinos = (await this.ativos(tx, usuarioId))
      .filter((c) => c.estado.canal === canal)
      .map((c) => c.estado.destino);
    if (canal !== 'push') return destinos;
    return [...this.#push.values()]
      .filter((p) => p.usuarioId === usuarioId && p.ativo && destinos.includes(p.dispositivoId))
      .map((p) => p.token);
  }

  gravar(tx: TransacaoEmMemoria, d: DestinoPushNovo, id: Uuid): Promise<Uuid> {
    const atual = [...this.#push.values()].find((p) => p.dispositivoId === d.dispositivoId);
    const gravado = atual?.id ?? id;
    tx.aoConfirmar(() => this.#push.set(gravado, { ...d, id: gravado, ativo: true }));
    return Promise.resolve(gravado);
  }

  desativar(
    tx: TransacaoEmMemoria,
    usuarioId: Uuid,
    dispositivoId: Uuid,
  ): Promise<Uuid | undefined> {
    const atual = [...this.#push.values()].find(
      (p) => p.usuarioId === usuarioId && p.dispositivoId === dispositivoId && p.ativo,
    );
    if (atual === undefined) return Promise.resolve(undefined);
    tx.aoConfirmar(() => this.#push.set(atual.id, { ...atual, ativo: false }));
    return Promise.resolve(atual.id);
  }
}

/** Supressões em memória, para testes (só a consulta). */
export class SupressoesEmMemoria implements ConsultaDeSupressoes<unknown> {
  readonly itens: Supressao[] = [];

  listar(
    _transacao: unknown,
    pagina: { readonly limite: number; readonly apos?: string },
  ): Promise<Supressao[]> {
    const { apos } = pagina;
    return Promise.resolve(
      [...this.itens]
        .sort((a, b) => a.email.localeCompare(b.email))
        .filter((s) => apos === undefined || s.email > apos)
        .slice(0, pagina.limite),
    );
  }
}

/** Agenda de lembretes em memória, com o "único entre os agendados" do Postgres. Só para testes. */
export class LembretesEmMemoria implements RepositorioDeLembretes<TransacaoEmMemoria> {
  readonly linhas = new Map<Uuid, LembreteAgendado & { situacao: string }>();

  substituir(
    tx: TransacaoEmMemoria,
    prazoId: Uuid,
    novos: readonly LembreteAgendado[],
  ): Promise<void> {
    void this.cancelarDoPrazo(tx, prazoId);
    for (const l of novos) this.linhas.set(l.id, { ...l, situacao: 'agendado' });
    return Promise.resolve();
  }

  cancelarDoPrazo(_tx: TransacaoEmMemoria, prazoId: Uuid): Promise<number> {
    let n = 0;
    for (const l of this.linhas.values()) {
      if (l.prazoId === prazoId && l.situacao === 'agendado') {
        l.situacao = 'cancelado';
        n++;
      }
    }
    return Promise.resolve(n);
  }

  #devidos(agora: Instant) {
    return [...this.linhas.values()]
      .filter((l) => l.situacao === 'agendado' && l.disparoEm.epochMs <= agora.epochMs)
      .sort((a, b) => a.disparoEm.epochMs - b.disparoEm.epochMs);
  }

  tenantsComDevidos(_tx: TransacaoEmMemoria, agora: Instant): Promise<Uuid[]> {
    return Promise.resolve([...new Set(this.#devidos(agora).map((l) => l.tenantId))]);
  }

  devidos(_tx: TransacaoEmMemoria, agora: Instant, limite: number): Promise<LembreteAgendado[]> {
    return Promise.resolve(this.#devidos(agora).slice(0, limite));
  }

  marcar(_tx: TransacaoEmMemoria, id: Uuid, desfecho: DesfechoDoLembrete): Promise<void> {
    const l = this.linhas.get(id);
    if (l !== undefined) l.situacao = desfecho;
    return Promise.resolve();
  }

  prazosDoUsuario(_tx: TransacaoEmMemoria, usuarioId: Uuid): Promise<Uuid[]> {
    return Promise.resolve([
      ...new Set(
        [...this.linhas.values()]
          .filter((l) => l.usuarioId === usuarioId && l.situacao === 'agendado')
          .map((l) => l.prazoId),
      ),
    ]);
  }
}

/** Preferências em memória (padrão quando ausentes). Só para testes. */
export class PreferenciasEmMemoria
  implements
    PreferenciasDeNotificacao<TransacaoEmMemoria>,
    RepositorioDePreferencias<TransacaoEmMemoria>
{
  readonly #gravadas = new Map<Uuid, PreferenciasDoUsuario>();

  ativo(
    _tx: TransacaoEmMemoria,
    usuarioId: Uuid,
    tipo: TipoDeNotificacao,
  ): Promise<boolean | undefined> {
    const ativos = this.#gravadas.get(usuarioId)?.ativos as Record<string, boolean> | undefined;
    return Promise.resolve(ativos?.[tipo]);
  }

  antecedencias(_tx: TransacaoEmMemoria, usuarioId: Uuid): Promise<readonly number[] | undefined> {
    return Promise.resolve(this.#gravadas.get(usuarioId)?.antecedencias);
  }

  ler(_tx: TransacaoEmMemoria, usuarioId: Uuid): Promise<Partial<PreferenciasDoUsuario>> {
    return Promise.resolve(this.#gravadas.get(usuarioId) ?? {});
  }

  gravar(
    _tx: TransacaoEmMemoria,
    _tenantId: Uuid,
    usuarioId: Uuid,
    p: PreferenciasDoUsuario,
  ): Promise<void> {
    this.#gravadas.set(usuarioId, p);
    return Promise.resolve();
  }
}

/** Envios manuais em memória (PZ-361); a situação sai das notificações do repositório dado. */
export class EnviosEmMemoria implements RepositorioDeEnvios<TransacaoEmMemoria> {
  readonly envios = new Map<
    Uuid,
    {
      id: Uuid;
      usuarioId: Uuid;
      recurso: RecursoDoEnvio;
      destinatarios: number;
      notificacaoId: Uuid | null;
      motivoFalha: string | null;
      criadoEm: Instant;
    }
  >();

  constructor(
    private readonly notificacoes: NotificacoesEmMemoria,
    private readonly relogio: { agora(): Instant },
  ) {}

  registrar(
    tx: TransacaoEmMemoria,
    e: { id: Uuid; usuarioId: Uuid; recurso: RecursoDoEnvio; destinatarios: number },
  ): Promise<void> {
    const agora = this.relogio.agora();
    tx.aoConfirmar(() =>
      this.envios.set(e.id, { ...e, notificacaoId: null, motivoFalha: null, criadoEm: agora }),
    );
    return Promise.resolve();
  }

  vincularNotificacao(tx: TransacaoEmMemoria, envioId: Uuid, notificacaoId: Uuid): Promise<void> {
    tx.aoConfirmar(() => {
      const atual = this.envios.get(envioId);
      if (atual !== undefined) this.envios.set(envioId, { ...atual, notificacaoId });
    });
    return Promise.resolve();
  }

  marcarFalha(tx: TransacaoEmMemoria, envioId: Uuid, motivo: string): Promise<void> {
    tx.aoConfirmar(() => {
      const atual = this.envios.get(envioId);
      if (atual !== undefined) this.envios.set(envioId, { ...atual, motivoFalha: motivo });
    });
    return Promise.resolve();
  }

  recentes(_tx: TransacaoEmMemoria, usuarioId: Uuid, limite: number): Promise<EnvioRecente[]> {
    return Promise.resolve(
      [...this.envios.values()]
        .filter((e) => e.usuarioId === usuarioId)
        .sort((a, b) => b.criadoEm.epochMs - a.criadoEm.epochMs)
        .slice(0, limite)
        .map((e) => {
          const n = this.notificacoes.todas().find((x) => x.id === e.notificacaoId);
          return {
            id: e.id,
            recurso: e.recurso,
            destinatarios: e.destinatarios,
            criadoEm: e.criadoEm,
            ...situacaoDoEnvio({
              motivoFalha: e.motivoFalha,
              notificacao:
                n === undefined
                  ? null
                  : {
                      enviadaEm: n.enviadaEm ?? null,
                      rejeitadaEm: n.rejeitadaEm ?? null,
                      motivoRejeicao: n.motivoRejeicao ?? null,
                    },
            }),
          };
        }),
    );
  }

  async comProblemaDesde(tx: TransacaoEmMemoria, usuarioId: Uuid, desde: Instant): Promise<number> {
    const todos = await this.recentes(tx, usuarioId, Number.MAX_SAFE_INTEGER);
    return todos.filter(
      (e) =>
        !e.criadoEm.ehAntesDe(desde) && (e.situacao === 'falhou' || e.situacao === 'rejeitado'),
    ).length;
  }
}
