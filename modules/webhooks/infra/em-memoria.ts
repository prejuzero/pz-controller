import type {
  Assinatura,
  Entrega,
  RepositorioDeAssinaturas,
  RepositorioDeEntregas,
  TentativaDeEntrega,
} from '../application/portas.js';
import type { EventoPublico } from '../domain/eventos-publicos.js';
import type { Instant, Uuid } from '@pz/kernel';

/** Assinaturas em memória, para os testes das apps (sem PostgreSQL, sem tenant). */
export class AssinaturasDeWebhookEmMemoria implements RepositorioDeAssinaturas<unknown> {
  readonly itens = new Map<Uuid, Assinatura>();

  inserir(_tx: unknown, a: Assinatura): Promise<void> {
    this.itens.set(a.id, a);
    return Promise.resolve();
  }

  listar(): Promise<Assinatura[]> {
    return Promise.resolve([...this.itens.values()].reverse());
  }

  buscar(_tx: unknown, id: Uuid): Promise<Assinatura | undefined> {
    return Promise.resolve(this.itens.get(id));
  }

  desativar(_tx: unknown, id: Uuid, agora: Instant): Promise<boolean> {
    const a = this.itens.get(id);
    if (a?.desativadaEm !== null) return Promise.resolve(false);
    this.itens.set(id, { ...a, desativadaEm: agora });
    return Promise.resolve(true);
  }

  ativasDoEvento(_tx: unknown, tipo: EventoPublico): Promise<Assinatura[]> {
    return Promise.resolve(
      [...this.itens.values()].filter((a) => a.desativadaEm === null && a.eventos.includes(tipo)),
    );
  }
}

/** Entregas em memória, para os testes das apps. */
export class EntregasDeWebhookEmMemoria implements RepositorioDeEntregas<unknown> {
  readonly itens = new Map<Uuid, Entrega>();

  inserirSeNova(_tx: unknown, e: Entrega): Promise<boolean> {
    const repetida = [...this.itens.values()].some(
      (x) => x.assinaturaId === e.assinaturaId && x.eventoId === e.eventoId,
    );
    if (!repetida) this.itens.set(e.id, e);
    return Promise.resolve(!repetida);
  }

  buscar(_tx: unknown, id: Uuid): Promise<Entrega | undefined> {
    return Promise.resolve(this.itens.get(id));
  }

  registrarTentativa(_tx: unknown, id: Uuid, t: TentativaDeEntrega): Promise<void> {
    const e = this.itens.get(id);
    if (e !== undefined) {
      this.itens.set(id, {
        ...e,
        situacao: t.situacao,
        ultimoStatus: t.status,
        ultimoErro: t.erro,
        tentativas: e.tentativas + (t.enviou ? 1 : 0),
        entregueEm: t.situacao === 'entregue' ? t.agora : e.entregueEm,
      });
    }
    return Promise.resolve();
  }

  reabrir(_tx: unknown, id: Uuid): Promise<boolean> {
    const e = this.itens.get(id);
    if (e?.situacao !== 'falhou') return Promise.resolve(false);
    this.itens.set(id, { ...e, situacao: 'pendente' });
    return Promise.resolve(true);
  }

  listar(
    _tx: unknown,
    filtro: { readonly assinaturaId?: Uuid; readonly limite: number },
  ): Promise<Entrega[]> {
    return Promise.resolve(
      [...this.itens.values()]
        .filter((e) => filtro.assinaturaId === undefined || e.assinaturaId === filtro.assinaturaId)
        .reverse()
        .slice(0, filtro.limite),
    );
  }
}
