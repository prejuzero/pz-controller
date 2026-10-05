import type { EventoDominio } from './entidade.js';
import type { Instant } from './instant.js';
import type { FilaDoRelay, Outbox, RegistroDeProcessamento, UnidadeDeTrabalho } from './outbox.js';
import type { Uuid } from './uuid.js';

/** Transação em memória: acumula as escritas e só as aplica se o trabalho terminar sem erro. */
export class TransacaoEmMemoria {
  readonly eventosGravados: EventoDominio[] = [];
  readonly publicados = new Map<Uuid, Instant>();
  readonly processados = new Set<string>();
  readonly reservados = new Set<Uuid>();
  readonly acoesAoConfirmar: (() => void)[] = [];

  /** Efeito colateral do teste que só deve acontecer se a transação for confirmada. */
  aoConfirmar(acao: () => void): void {
    this.acoesAoConfirmar.push(acao);
  }
}

interface EventoGuardado {
  readonly evento: EventoDominio;
  publicadoEm?: Instant;
}

/**
 * Implementação em memória das portas do outbox, com a semântica do Postgres que importa para
 * as garantias: transação com rollback, `FOR UPDATE SKIP LOCKED` na reserva do relay e chave
 * única em (consumidor, evento) no registro de processamento. Só para testes.
 */
export class OutboxEmMemoria
  implements
    UnidadeDeTrabalho<TransacaoEmMemoria>,
    Outbox<TransacaoEmMemoria>,
    FilaDoRelay<TransacaoEmMemoria>,
    RegistroDeProcessamento<TransacaoEmMemoria>
{
  /** Simula a queda do relay entre publicar e marcar os eventos como publicados. */
  falharAoMarcarPublicados = false;

  readonly #eventos: EventoGuardado[] = [];
  readonly #processados = new Set<string>();
  readonly #reservados = new Set<Uuid>();
  readonly #processamentosEmAndamento = new Set<string>();

  async executar<Resultado>(
    trabalho: (transacao: TransacaoEmMemoria) => Promise<Resultado>,
  ): Promise<Resultado> {
    const transacao = new TransacaoEmMemoria();
    try {
      const resultado = await trabalho(transacao);
      this.#confirmar(transacao);
      return resultado;
    } finally {
      for (const id of transacao.reservados) this.#reservados.delete(id);
      for (const chave of transacao.processados) this.#processamentosEmAndamento.delete(chave);
    }
  }

  gravar(transacao: TransacaoEmMemoria, eventos: readonly EventoDominio[]): Promise<void> {
    transacao.eventosGravados.push(...eventos.map((evento) => Object.freeze({ ...evento })));
    return Promise.resolve();
  }

  reservarPendentes(
    transacao: TransacaoEmMemoria,
    limite: number,
  ): Promise<readonly EventoDominio[]> {
    const livres = this.#eventos
      .filter((item) => item.publicadoEm === undefined && !this.#reservados.has(item.evento.id))
      .slice(0, limite)
      .map((item) => item.evento);
    for (const evento of livres) {
      this.#reservados.add(evento.id);
      transacao.reservados.add(evento.id);
    }
    return Promise.resolve(livres);
  }

  marcarPublicados(
    transacao: TransacaoEmMemoria,
    ids: readonly Uuid[],
    em: Instant,
  ): Promise<void> {
    if (this.falharAoMarcarPublicados) {
      return Promise.reject(new Error('falha simulada ao marcar os eventos como publicados'));
    }
    for (const id of ids) transacao.publicados.set(id, em);
    return Promise.resolve();
  }

  registrarSeNovo(
    transacao: TransacaoEmMemoria,
    consumidor: string,
    eventoId: Uuid,
  ): Promise<boolean> {
    const chave = `${consumidor}:${eventoId}`;
    if (this.#processados.has(chave)) return Promise.resolve(false);
    // Como no Postgres, outra transação inserindo a mesma chave impede esta de seguir; aqui o
    // conflito vira erro e a fila tenta de novo depois.
    if (this.#processamentosEmAndamento.has(chave)) {
      return Promise.reject(new Error(`evento ${eventoId} em processamento por ${consumidor}`));
    }
    this.#processamentosEmAndamento.add(chave);
    transacao.processados.add(chave);
    return Promise.resolve(true);
  }

  /** Eventos confirmados e ainda não publicados, na ordem de gravação. */
  pendentes(): readonly EventoDominio[] {
    return this.#eventos
      .filter((item) => item.publicadoEm === undefined)
      .map((item) => item.evento);
  }

  publicadoEm(id: string): Instant | undefined {
    return this.#eventos.find((item) => item.evento.id === id)?.publicadoEm;
  }

  #confirmar(transacao: TransacaoEmMemoria): void {
    for (const evento of transacao.eventosGravados) this.#eventos.push({ evento });
    for (const item of this.#eventos) {
      const em = transacao.publicados.get(item.evento.id);
      if (em !== undefined) item.publicadoEm = em;
    }
    for (const chave of transacao.processados) this.#processados.add(chave);
    for (const acao of transacao.acoesAoConfirmar) acao();
  }
}
