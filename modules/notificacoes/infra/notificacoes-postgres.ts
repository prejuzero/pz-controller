import { Instant } from '@pz/kernel';

import { Notificacao } from '../domain/notificacao.js';

import type {
  ListaDeSupressao,
  PreferenciasDeNotificacao,
  RepositorioDeNotificacoes,
} from '../application/portas.js';
import type { Canal, TipoDeNotificacao } from '../domain/notificacao.js';
import type { Transacao } from '@pz/db';
import type { Uuid } from '@pz/kernel';

/** Notificações no PostgreSQL (HU30), no tenant da transação (RLS). */
export class NotificacoesPostgres implements RepositorioDeNotificacoes<Transacao> {
  async inserir(tx: Transacao, notificacao: Notificacao): Promise<boolean> {
    const e = notificacao.estado;
    // ON CONFLICT DO NOTHING na chave de idempotência: pedido repetido não aborta a transação.
    const { count } = await tx.notificacao.createMany({
      data: [
        {
          id: e.id,
          tenantId: e.tenantId,
          usuarioId: e.usuarioId,
          prazoId: e.prazoId ?? null,
          canal: e.canal,
          tipo: e.tipo,
          chaveIdempotencia: e.chave,
          template: e.tipo,
          versaoTemplate: e.versaoTemplate,
          destinatarios: [...e.destinatarios],
          dados: e.dados as object,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async buscar(tx: Transacao, id: Uuid): Promise<Notificacao | undefined> {
    const l = await tx.notificacao.findUnique({ where: { id } });
    return l === null ? undefined : restaurar(l);
  }

  async buscarPorIdExterno(tx: Transacao, idExterno: string): Promise<Notificacao | undefined> {
    const l = await tx.notificacao.findUnique({ where: { idExterno } });
    return l === null ? undefined : restaurar(l);
  }

  async registrarDesfecho(tx: Transacao, notificacao: Notificacao): Promise<void> {
    const { id, entregueEm, abertaEm, rejeitadaEm, motivoRejeicao } = notificacao.estado;
    await tx.notificacao.update({
      where: { id },
      data: {
        entregueEm: data(entregueEm),
        abertaEm: data(abertaEm),
        rejeitadaEm: data(rejeitadaEm),
        motivoRejeicao: motivoRejeicao ?? null,
      },
    });
  }

  async usuariosComRejeicaoDesde(tx: Transacao, desde: Instant): Promise<number> {
    const linhas = await tx.notificacao.findMany({
      where: { rejeitadaEm: { gte: new Date(desde.epochMs) } },
      distinct: ['usuarioId'],
      select: { usuarioId: true },
    });
    return linhas.length;
  }

  async registrarEnvio(tx: Transacao, notificacao: Notificacao): Promise<void> {
    const { id, idExterno, enviadaEm } = notificacao.estado;
    await tx.notificacao.update({
      where: { id },
      data: { idExterno: idExterno ?? null, enviadaEm: data(enviadaEm) },
    });
  }
}

function data(instante: Instant | undefined): Date | null {
  return instante === undefined ? null : new Date(instante.epochMs);
}

function instante(valor: Date | null): Instant | undefined {
  return valor === null ? undefined : Instant.deEpochMs(valor.getTime());
}

type LinhaNotificacao = NonNullable<Awaited<ReturnType<Transacao['notificacao']['findUnique']>>>;

function restaurar(l: LinhaNotificacao): Notificacao {
  const enviadaEm = instante(l.enviadaEm);
  const entregueEm = instante(l.entregueEm);
  const abertaEm = instante(l.abertaEm);
  const rejeitadaEm = instante(l.rejeitadaEm);
  return Notificacao.restaurar({
    id: l.id as Uuid,
    tenantId: l.tenantId as Uuid,
    usuarioId: l.usuarioId as Uuid,
    ...(l.prazoId === null ? {} : { prazoId: l.prazoId as Uuid }),
    canal: l.canal,
    tipo: l.tipo as TipoDeNotificacao,
    chave: l.chaveIdempotencia,
    versaoTemplate: l.versaoTemplate,
    destinatarios: l.destinatarios,
    dados: l.dados,
    ...(enviadaEm === undefined ? {} : { enviadaEm }),
    ...(l.idExterno === null ? {} : { idExterno: l.idExterno }),
    ...(entregueEm === undefined ? {} : { entregueEm }),
    ...(abertaEm === undefined ? {} : { abertaEm }),
    ...(rejeitadaEm === undefined ? {} : { rejeitadaEm }),
    ...(l.motivoRejeicao === null ? {} : { motivoRejeicao: l.motivoRejeicao }),
  });
}

export class PreferenciasPostgres implements PreferenciasDeNotificacao<Transacao> {
  async ativo(
    tx: Transacao,
    usuarioId: Uuid,
    tipo: TipoDeNotificacao,
    canal: Canal,
  ): Promise<boolean | undefined> {
    const linha = await tx.preferenciaNotificacao.findUnique({
      where: { usuarioId_tipo_canal: { usuarioId, tipo, canal } },
      select: { ativo: true },
    });
    return linha?.ativo;
  }
}

export class SupressaoPostgres implements ListaDeSupressao<Transacao> {
  async suprimidos(tx: Transacao, emails: readonly string[]): Promise<ReadonlySet<string>> {
    if (emails.length === 0) return new Set();
    const linhas = await tx.supressao.findMany({
      where: { email: { in: emails.map((e) => e.toLowerCase()) } },
      select: { email: true },
    });
    return new Set(linhas.map((l) => l.email));
  }

  async suprimir(
    tx: Transacao,
    emails: readonly string[],
    motivo: 'bounce' | 'spam',
  ): Promise<void> {
    if (emails.length === 0) return;
    await tx.supressao.createMany({
      data: emails.map((e) => ({ email: e.toLowerCase(), motivo })),
      skipDuplicates: true,
    });
  }
}
